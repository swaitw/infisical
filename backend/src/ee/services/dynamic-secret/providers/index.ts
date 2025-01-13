import { SnowflakeProvider } from "@app/ee/services/dynamic-secret/providers/snowflake";

import { AwsElastiCacheDatabaseProvider } from "./aws-elasticache";
import { AwsIamProvider } from "./aws-iam";
import { AzureEntraIDProvider } from "./azure-entra-id";
import { CassandraProvider } from "./cassandra";
import { ElasticSearchProvider } from "./elastic-search";
import { LdapProvider } from "./ldap";
import { DynamicSecretProviders, TDynamicProviderFns } from "./models";
import { MongoAtlasProvider } from "./mongo-atlas";
import { MongoDBProvider } from "./mongo-db";
import { RabbitMqProvider } from "./rabbit-mq";
import { RedisDatabaseProvider } from "./redis";
import { SapAseProvider } from "./sap-ase";
import { SapHanaProvider } from "./sap-hana";
import { SqlDatabaseProvider } from "./sql-database";
import { TotpProvider } from "./totp";

export const buildDynamicSecretProviders = (): Record<DynamicSecretProviders, TDynamicProviderFns> => ({
  [DynamicSecretProviders.SqlDatabase]: SqlDatabaseProvider(),
  [DynamicSecretProviders.Cassandra]: CassandraProvider(),
  [DynamicSecretProviders.AwsIam]: AwsIamProvider(),
  [DynamicSecretProviders.Redis]: RedisDatabaseProvider(),
  [DynamicSecretProviders.AwsElastiCache]: AwsElastiCacheDatabaseProvider(),
  [DynamicSecretProviders.MongoAtlas]: MongoAtlasProvider(),
  [DynamicSecretProviders.MongoDB]: MongoDBProvider(),
  [DynamicSecretProviders.ElasticSearch]: ElasticSearchProvider(),
  [DynamicSecretProviders.RabbitMq]: RabbitMqProvider(),
  [DynamicSecretProviders.AzureEntraID]: AzureEntraIDProvider(),
  [DynamicSecretProviders.Ldap]: LdapProvider(),
  [DynamicSecretProviders.SapHana]: SapHanaProvider(),
  [DynamicSecretProviders.Snowflake]: SnowflakeProvider(),
  [DynamicSecretProviders.Totp]: TotpProvider(),
  [DynamicSecretProviders.SapAse]: SapAseProvider()
});
