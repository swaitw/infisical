import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TProjectEnvironments, TSecretFolders, TSecretFoldersUpdate } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { groupBy, removeTrailingSlash } from "@app/lib/fn";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { isValidSecretPath } from "@app/lib/validator";
import { SecretsOrderBy } from "@app/services/secret/secret-types";

import { TFindFoldersDeepByParentIdsDTO } from "./secret-folder-types";

export const validateFolderName = (folderName: string) => {
  const validNameRegex = /^[a-zA-Z0-9-_]+$/;
  return validNameRegex.test(folderName);
};

const sqlFindMultipleFolderByEnvPathQuery = (db: Knex, query: Array<{ envId: string; secretPath: string }>) => {
  // this is removing an trailing slash like /folder1/folder2/ -> /folder1/folder2
  const formatedQuery = query.map(({ envId, secretPath }) => {
    const formatedPath = secretPath.at(-1) === "/" && secretPath.length > 1 ? secretPath.slice(0, -1) : secretPath;
    const segments = formatedPath.split("/").filter(Boolean);
    if (segments.some((segment) => !validateFolderName(segment))) {
      throw new BadRequestError({ message: "Invalid folder name" });
    }
    return {
      envId,
      secretPath: segments
    };
  });
  // next goal to sanitize saw the raw sql query is safe
  // for this we ensure folder name contains only string and - nothing else

  return db
    .withRecursive("parent", (baseQb) => {
      // first remember our folders are connected as a link list or known as adjacency list
      // Thus each node has connection to parent node
      // for a given path from root we recursively reach to the leaf path or till we get null
      // the below query is the base case where we select root folder which has parent folder id as null
      void baseQb
        .select({
          depth: 1,
          // latestFolderVerId: db.raw("NULL::uuid"),
          path: db.raw("'/'")
        })
        .from(TableName.SecretFolder)
        .where({
          parentId: null
        })
        .whereIn(
          "envId",
          formatedQuery.map(({ envId }) => envId)
        )
        .select(selectAllTableCols(TableName.SecretFolder))
        .union(
          (qb) =>
            // for here on we keep going to next child node.
            // we also keep a measure of depth then we check the depth matches the array path segment and folder name
            // that is at depth 1 for a path /folder1/folder2 -> the name should be folder1
            void qb
              .select({
                depth: db.raw("parent.depth + 1"),
                path: db.raw(
                  "CONCAT((CASE WHEN parent.path = '/' THEN '' ELSE parent.path END),'/', secret_folders.name)"
                )
              })
              .select(selectAllTableCols(TableName.SecretFolder))
              .where((wb) =>
                formatedQuery.map(({ secretPath }) =>
                  wb.orWhereRaw(
                    `depth = array_position(ARRAY[${secretPath.map(() => "?").join(",")}]::varchar[], ${
                      TableName.SecretFolder
                    }.name,depth)`,
                    [...secretPath]
                  )
                )
              )
              .from(TableName.SecretFolder)
              .join("parent", (bd) =>
                bd
                  .on("parent.id", `${TableName.SecretFolder}.parentId`)
                  .andOn("parent.envId", `${TableName.SecretFolder}.envId`)
              )
        );
    })
    .select("*")
    .from<TSecretFolders & { depth: number; path: string }>("parent");
};

const sqlFindFolderByPathQuery = (db: Knex, projectId: string, environments: string[], secretPath: string) => {
  // this is removing an trailing slash like /folder1/folder2/ -> /folder1/folder2
  const formatedPath = secretPath.at(-1) === "/" && secretPath.length > 1 ? secretPath.slice(0, -1) : secretPath;
  // next goal to sanitize saw the raw sql query is safe
  // for this we ensure folder name contains only string and - nothing else
  const pathSegments = formatedPath.split("/").filter(Boolean);
  if (pathSegments.some((segment) => !validateFolderName(segment))) {
    throw new BadRequestError({ message: "Invalid folder name" });
  }

  return db
    .withRecursive("parent", (baseQb) => {
      // first remember our folders are connected as a link list or known as adjacency list
      // Thus each node has connection to parent node
      // for a given path from root we recursively reach to the leaf path or till we get null
      // the below query is the base case where we select root folder which has parent folder id as null
      void baseQb
        .select({
          depth: 1,
          // latestFolderVerId: db.raw("NULL::uuid"),
          path: db.raw("'/'")
        })
        .from(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where({
          projectId,
          parentId: null
        })
        .whereIn(`${TableName.Environment}.slug`, environments)
        .select(selectAllTableCols(TableName.SecretFolder))
        .union(
          (qb) =>
            // for here on we keep going to next child node.
            // we also keep a measure of depth then we check the depth matches the array path segment and folder name
            // that is at depth 1 for a path /folder1/folder2 -> the name should be folder1
            void qb
              .select({
                depth: db.raw("parent.depth + 1"),
                path: db.raw(
                  "CONCAT((CASE WHEN parent.path = '/' THEN '' ELSE parent.path END),'/', secret_folders.name)"
                )
              })
              .select(selectAllTableCols(TableName.SecretFolder))
              .whereRaw(
                `depth = array_position(ARRAY[${pathSegments
                  .map(() => "?")
                  .join(",")}]::varchar[], secret_folders.name,depth)`,
                [...pathSegments]
              )
              .from(TableName.SecretFolder)
              .join("parent", "parent.id", `${TableName.SecretFolder}.parentId`)
        );
    })
    .from<TSecretFolders & { depth: number; path: string }>("parent")
    .leftJoin<TProjectEnvironments>(TableName.Environment, `${TableName.Environment}.id`, "parent.envId")
    .select<
      (TSecretFolders & {
        depth: number;
        path: string;
        envId: string;
        envSlug: string;
        envName: string;
        projectId: string;
      })[]
    >(
      selectAllTableCols("parent" as TableName.SecretFolder),
      db.ref("id").withSchema(TableName.Environment).as("envId"),
      db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
      db.ref("name").withSchema(TableName.Environment).as("envName"),
      db.ref("projectId").withSchema(TableName.Environment)
    );
};

const sqlFindSecretPathByFolderId = (db: Knex, projectId: string, folderIds: string[]) =>
  db
    .withRecursive("parent", (baseQb) => {
      // first remember our folders are connected as a link list or known as adjacency list
      // Thus each node has connection to parent node
      // we first find the folder given in folder id
      void baseQb
        .from(TableName.SecretFolder)
        .select(selectAllTableCols(TableName.SecretFolder))
        .select({
          // this is for root condition
          //  if the given folder id is root folder id then intial path is set as / instead of /root
          //  if not root folder the path here will be /<folder name>
          depth: 1,
          path: db.raw(`CONCAT('/', (CASE WHEN "parentId" is NULL THEN '' ELSE ${TableName.SecretFolder}.name END))`),
          child: db.raw("NULL::uuid"),
          environmentSlug: `${TableName.Environment}.slug`
        })
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where({ projectId })
        .whereIn(`${TableName.SecretFolder}.id`, folderIds)
        .union(
          (qb) =>
            // then we keep going up
            // until parent id is null
            void qb
              .select(selectAllTableCols(TableName.SecretFolder))
              .select({
                // then we join join this folder name behind previous as we are going from child to parent
                // the root folder check is used to avoid last / and also root name in folders
                depth: db.raw("parent.depth + 1"),
                path: db.raw(
                  `CONCAT( CASE 
                  WHEN  ${TableName.SecretFolder}."parentId" is NULL THEN '' 
                  ELSE  CONCAT('/', secret_folders.name) 
                END, parent.path )`
                ),
                child: db.raw("COALESCE(parent.child, parent.id)"),
                environmentSlug: "parent.environmentSlug"
              })
              .from(TableName.SecretFolder)
              .join("parent", "parent.parentId", `${TableName.SecretFolder}.id`)
        );
    })
    .select("*")
    .from<TSecretFolders & { child: string | null; path: string; environmentSlug: string; depth: number }>("parent");

export type TSecretFolderDALFactory = ReturnType<typeof secretFolderDALFactory>;
// never change this. If u do write a migration for it
export const ROOT_FOLDER_NAME = "root";
export const secretFolderDALFactory = (db: TDbClient) => {
  const secretFolderOrm = ormify(db, TableName.SecretFolder);

  const findBySecretPath = async (projectId: string, environment: string, path: string, tx?: Knex) => {
    const isValidPath = isValidSecretPath(path);
    if (!isValidPath)
      throw new BadRequestError({
        message: "Invalid secret path. Only alphanumeric characters, dashes, and underscores are allowed."
      });

    try {
      const folder = await sqlFindFolderByPathQuery(
        tx || db.replicaNode(),
        projectId,
        [environment],
        removeTrailingSlash(path)
      )
        .orderBy("depth", "desc")
        .first();
      if (folder && folder.path !== removeTrailingSlash(path)) {
        return;
      }
      if (!folder) return;
      const { envId: id, envName: name, envSlug: slug, ...el } = folder;
      return { ...el, envId: id, environment: { id, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by secret path" });
    }
  };

  // finds folders by path for multiple envs
  const findBySecretPathMultiEnv = async (projectId: string, environments: string[], path: string, tx?: Knex) => {
    const isValidPath = isValidSecretPath(path);
    if (!isValidPath)
      throw new BadRequestError({
        message: "Invalid secret path. Only alphanumeric characters, dashes, and underscores are allowed."
      });

    try {
      const pathDepth = removeTrailingSlash(path).split("/").filter(Boolean).length + 1;

      const folders = await sqlFindFolderByPathQuery(
        tx || db.replicaNode(),
        projectId,
        environments,
        removeTrailingSlash(path)
      )
        .orderBy("depth", "desc")
        .where("depth", pathDepth);

      const firstFolder = folders[0];

      if (firstFolder && firstFolder.path !== removeTrailingSlash(path)) {
        return [];
      }

      return folders.map((folder) => {
        const { envId: id, envName: name, envSlug: slug, ...el } = folder;
        return { ...el, envId: id, environment: { id, name, slug } };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find folders by secret path multi env" });
    }
  };

  // used in folder creation
  // even if its the original given /path1/path2
  // it will stop automatically at /path2
  const findClosestFolder = async (projectId: string, environment: string, path: string, tx?: Knex) => {
    const isValidPath = isValidSecretPath(path);
    if (!isValidPath)
      throw new BadRequestError({
        message: "Invalid secret path. Only alphanumeric characters, dashes, and underscores are allowed."
      });

    try {
      const folder = await sqlFindFolderByPathQuery(
        tx || db.replicaNode(),
        projectId,
        [environment],
        removeTrailingSlash(path)
      )
        .orderBy("depth", "desc")
        .first();
      if (!folder) return;
      const { envId: id, envName: name, envSlug: slug, ...el } = folder;
      return { ...el, envId: id, environment: { id, name, slug } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by secret path" });
    }
  };

  const findByManySecretPath = async (query: Array<{ envId: string; secretPath: string }>, tx?: Knex) => {
    try {
      const formatedQuery = query.map(({ secretPath, envId }) => ({
        envId,
        secretPath: removeTrailingSlash(secretPath)
      }));
      const folders = await sqlFindMultipleFolderByEnvPathQuery(tx || db.replicaNode(), formatedQuery);
      return formatedQuery.map(({ envId, secretPath }) =>
        folders.find(({ path: targetPath, envId: targetEnvId }) => targetPath === secretPath && targetEnvId === envId)
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByManySecretPath" });
    }
  };

  // this is used to do an inverse query in folders
  // that is instances in which for a given folderid find the secret path
  const findSecretPathByFolderIds = async (projectId: string, folderIds: string[], tx?: Knex) => {
    try {
      const folders = await sqlFindSecretPathByFolderId(tx || db.replicaNode(), projectId, folderIds);

      //  travelling all the way from leaf node to root contains real path
      const rootFolders = groupBy(
        folders.filter(({ parentId }) => parentId === null),
        (i) => i.child || i.id // root condition then child and parent will null
      );
      const actualFolders = groupBy(
        folders.filter(({ depth }) => depth === 1),
        (i) => i.id // root condition then child and parent will null
      );

      return folderIds.map((folderId) => {
        if (!rootFolders[folderId]?.[0]) return;

        const actualId = rootFolders[folderId][0].child || rootFolders[folderId][0].id;
        const folder = actualFolders[actualId][0];
        return { ...folder, path: rootFolders[folderId]?.[0].path };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by secret path" });
    }
  };

  const update = async (filter: Partial<TSecretFolders>, data: TSecretFoldersUpdate, tx?: Knex) => {
    try {
      const folder = await (tx || db)(TableName.SecretFolder)
        .where(filter)
        .update(data)
        .increment("version", 1)
        .returning("*");
      return folder;
    } catch (error) {
      throw new DatabaseError({ error, name: "SecretFolderUpdate" });
    }
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const folder = await (tx || db.replicaNode())(TableName.SecretFolder)
        .where({ [`${TableName.SecretFolder}.id` as "id"]: id })
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .select(selectAllTableCols(TableName.SecretFolder))
        .select(
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("version").withSchema(TableName.Project).as("projectVersion")
        )
        .first();
      if (folder) {
        const { envId, envName, envSlug, ...el } = folder;
        return { ...el, environment: { envId, envName, envSlug }, envId };
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  // special query for project migration
  const findByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const folders = await (tx || db.replicaNode())(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .select(selectAllTableCols(TableName.SecretFolder))
        .where({ projectId })
        .select(
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("version").withSchema(TableName.Project).as("projectVersion")
        );
      return folders;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  // find project folders for multiple envs
  const findByMultiEnv = async (
    {
      environmentIds,
      parentIds,
      search,
      limit,
      offset = 0,
      orderBy = SecretsOrderBy.Name,
      orderDirection = OrderByDirection.ASC
    }: {
      environmentIds: string[];
      parentIds: string[];
      search?: string;
      limit?: number;
      offset?: number;
      orderBy?: SecretsOrderBy;
      orderDirection?: OrderByDirection;
    },
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.SecretFolder)
        .whereIn("parentId", parentIds)
        .whereIn("envId", environmentIds)
        .where("isReserved", false)
        .where((bd) => {
          if (search) {
            void bd.whereILike(`${TableName.SecretFolder}.name`, `%${search}%`);
          }
        })
        .leftJoin(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .select(
          selectAllTableCols(TableName.SecretFolder),
          db.raw(
            `DENSE_RANK() OVER (ORDER BY ${TableName.SecretFolder}."name" ${
              orderDirection ?? OrderByDirection.ASC
            }) as rank`
          ),
          db.ref("slug").withSchema(TableName.Environment).as("environment")
        )
        .orderBy(`${TableName.SecretFolder}.${orderBy}`, orderDirection);

      if (limit) {
        const rankOffset = offset + 1; // ranks start from 1
        return await (tx || db)
          .with("w", query)
          .select("*")
          .from<Awaited<typeof query>[number]>("w")
          .where("w.rank", ">=", rankOffset)
          .andWhere("w.rank", "<", rankOffset + limit);
      }

      const folders = await query;

      return folders;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find folders multi env" });
    }
  };

  const findByEnvsDeep = async ({ parentIds }: TFindFoldersDeepByParentIdsDTO, tx?: Knex) => {
    try {
      const folders = await (tx || db.replicaNode())
        .withRecursive("parents", (qb) =>
          qb
            .select(
              selectAllTableCols(TableName.SecretFolder),
              db.raw("0 as depth"),
              db.raw(`'/' as path`),
              db.ref(`${TableName.Environment}.slug`).as("environment")
            )
            .from(TableName.SecretFolder)
            .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
            .whereIn(`${TableName.SecretFolder}.id`, parentIds)
            .union((un) => {
              void un
                .select(
                  selectAllTableCols(TableName.SecretFolder),
                  db.raw("parents.depth + 1 as depth"),
                  db.raw(
                    `CONCAT(
                        CASE WHEN parents.path = '/' THEN '' ELSE parents.path END, 
                        CASE WHEN  ${TableName.SecretFolder}."parentId" is NULL THEN '' ELSE CONCAT('/', secret_folders.name) END
                    )`
                  ),
                  db.ref("parents.environment")
                )
                .from(TableName.SecretFolder)
                .join("parents", `${TableName.SecretFolder}.parentId`, "parents.id");
            })
        )
        .select<(TSecretFolders & { path: string; depth: number; environment: string })[]>("*")
        .from("parents")
        .orderBy("depth")
        .orderBy(`name`);

      return folders;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByEnvsDeep" });
    }
  };

  return {
    ...secretFolderOrm,
    update,
    findBySecretPath,
    findBySecretPathMultiEnv,
    findById,
    findByManySecretPath,
    findSecretPathByFolderIds,
    findClosestFolder,
    findByProjectId,
    findByMultiEnv,
    findByEnvsDeep
  };
};
