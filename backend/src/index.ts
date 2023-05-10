import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import * as Sentry from '@sentry/node';
import MongoStore from 'connect-mongo';
import { DatabaseService } from './services';
import { setUpHealthEndpoint } from './services/health';
import { initSmtp } from './services/smtp';
import { TelemetryService } from './services';
import { setTransporter } from './helpers/nodemailer';
import { createTestUserForDevelopment } from './utils/addDevelopmentUser';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { patchRouterParam } = require('./utils/patchAsyncRoutes');

import cookieParser from 'cookie-parser';
import swaggerUi = require('swagger-ui-express');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swaggerFile = require('../spec.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const requestIp = require('request-ip');
import { apiLimiter } from './helpers/rateLimiter';
import {
    workspace as eeWorkspaceRouter,
    secret as eeSecretRouter,
    secretSnapshot as eeSecretSnapshotRouter,
    action as eeActionRouter
} from './ee/routes/v1';
import {
    signup as v1SignupRouter,
    auth as v1AuthRouter,
    bot as v1BotRouter,
    organization as v1OrganizationRouter,
    workspace as v1WorkspaceRouter,
    membershipOrg as v1MembershipOrgRouter,
    membership as v1MembershipRouter,
    key as v1KeyRouter,
    inviteOrg as v1InviteOrgRouter,
    oauth as v1OAuth,
    user as v1UserRouter,
    userAction as v1UserActionRouter,
    secret as v1SecretRouter,
    serviceToken as v1ServiceTokenRouter,
    password as v1PasswordRouter,
    stripe as v1StripeRouter,
    integration as v1IntegrationRouter,
    integrationAuth as v1IntegrationAuthRouter,
    secretsFolder as v1SecretsFolder
} from './routes/v1';
import {
    signup as v2SignupRouter,
    auth as v2AuthRouter,
    users as v2UsersRouter,
    organizations as v2OrganizationsRouter,
    workspace as v2WorkspaceRouter,
    secret as v2SecretRouter, // begin to phase out
    secrets as v2SecretsRouter,
    serviceTokenData as v2ServiceTokenDataRouter,
    serviceAccounts as v2ServiceAccountsRouter,
    apiKeyData as v2APIKeyDataRouter,
    environment as v2EnvironmentRouter,
    tags as v2TagsRouter,
} from './routes/v2';
import {
    auth as v3AuthRouter,
    secrets as v3SecretsRouter,
    signup as v3SignupRouter,
    workspaces as v3WorkspacesRouter,
} from './routes/v3';
import { healthCheck } from './routes/status';
import { getLogger } from './utils/logger';
import { RouteNotFoundError } from './utils/errors';
import { requestErrorHandler } from './middleware/requestErrorHandler';
import {
    getMongoURL,
    getNodeEnv,
    getPort,
    getSentryDSN,
    getSiteURL,
    getSessionSecret,
} from './config';
import { initializePassport } from './utils/auth';

const main = async () => {
    TelemetryService.logTelemetryMessage();
    setTransporter(await initSmtp());

    const mongoURL = await getMongoURL();
    await DatabaseService.initDatabase(mongoURL);
    if ((await getNodeEnv()) !== 'test') {
        Sentry.init({
            dsn: await getSentryDSN(),
            tracesSampleRate: 1.0,
            debug: await getNodeEnv() === 'production' ? false : true,
            environment: await getNodeEnv()
        });
    }

    patchRouterParam();
    const app = express();

    await initializePassport();

    app.enable('trust proxy');
    app.use(express.json());
    app.use(cookieParser());
    app.use(
        cors({
            credentials: true,
            origin: await getSiteURL()
        })
    );

    app.use(requestIp.mw());
    app.use(session({
        secret: await getSessionSecret(),
        resave: false, // don't save session if unmodified
        saveUninitialized: false, // don't create session until something stored
        store: MongoStore.create({
            mongoUrl: mongoURL,
            dbName: 'sessions',
        })
    }));

    if ((await getNodeEnv()) === 'production') {
        // enable app-wide rate-limiting + helmet security
        // in production
        app.disable('x-powered-by');
        app.use(apiLimiter);
        app.use(helmet());
    }

    // (EE) routes
    app.use('/api/v1/secret', eeSecretRouter);
    app.use('/api/v1/secret-snapshot', eeSecretSnapshotRouter);
    app.use('/api/v1/workspace', eeWorkspaceRouter);
    app.use('/api/v1/action', eeActionRouter);

    // v1 routes (default)
    app.use('/api/v1/signup', v1SignupRouter);
    app.use('/api/v1/auth', v1AuthRouter);
    app.use('/api/v1/oauth', v1OAuth);
    app.use('/api/v1/bot', v1BotRouter);
    app.use('/api/v1/user', v1UserRouter);
    app.use('/api/v1/user-action', v1UserActionRouter);
    app.use('/api/v1/organization', v1OrganizationRouter);
    app.use('/api/v1/workspace', v1WorkspaceRouter);
    app.use('/api/v1/membership-org', v1MembershipOrgRouter);
    app.use('/api/v1/membership', v1MembershipRouter);
    app.use('/api/v1/key', v1KeyRouter);
    app.use('/api/v1/invite-org', v1InviteOrgRouter);
    app.use('/api/v1/secret', v1SecretRouter);
    app.use('/api/v1/service-token', v1ServiceTokenRouter); // deprecated
    app.use('/api/v1/password', v1PasswordRouter);
    app.use('/api/v1/stripe', v1StripeRouter);
    app.use('/api/v1/integration', v1IntegrationRouter);
    app.use('/api/v1/integration-auth', v1IntegrationAuthRouter);
    app.use('/api/v1/folder', v1SecretsFolder)

    // v2 routes (improvements)
    app.use('/api/v2/signup', v2SignupRouter);
    app.use('/api/v2/auth', v2AuthRouter);
    app.use('/api/v2/users', v2UsersRouter);
    app.use('/api/v2/organizations', v2OrganizationsRouter);
    app.use('/api/v2/workspace', v2EnvironmentRouter);
    app.use('/api/v2/workspace', v2TagsRouter);
    app.use('/api/v2/workspace', v2WorkspaceRouter);
    app.use('/api/v2/secret', v2SecretRouter); // deprecated
    app.use('/api/v2/secrets', v2SecretsRouter);
    app.use('/api/v2/service-token', v2ServiceTokenDataRouter); // TODO: turn into plural route
    app.use('/api/v2/service-accounts', v2ServiceAccountsRouter); // new
    app.use('/api/v2/api-key', v2APIKeyDataRouter);

    // v3 routes (experimental)
    app.use('/api/v3/auth', v3AuthRouter);
    app.use('/api/v3/secrets', v3SecretsRouter);
    app.use('/api/v3/workspaces', v3WorkspacesRouter);
    app.use('/api/v3/signup', v3SignupRouter);

    // api docs 
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile))

    // Server status
    app.use('/api', healthCheck)

    //* Handle unrouted requests and respond with proper error message as well as status code
    app.use((req, res, next) => {
        if (res.headersSent) return next();
        next(RouteNotFoundError({ message: `The requested source '(${req.method})${req.url}' was not found` }))
    })

    app.use(requestErrorHandler)

    const server = app.listen(await getPort(), async () => {
        (await getLogger("backend-main")).info(`Server started listening at port ${await getPort()}`)
    });

    await createTestUserForDevelopment();
    setUpHealthEndpoint(server);

    server.on('close', async () => {
        await DatabaseService.closeDatabase();
    })

    return server;
}

export default main();