import { Knex } from "knex";
import { Compare, Filter, parse } from "scim2-parse-filter";

const appendParentToGroupingOperator = (parentPath: string, filter: Filter) => {
  if (filter.op !== "[]" && filter.op !== "and" && filter.op !== "or" && filter.op !== "not") {
    return { ...filter, attrPath: `${parentPath}.${(filter as Compare).attrPath}` };
  }
  return filter;
};

const processDynamicQuery = (
  rootQuery: Knex.QueryBuilder,
  scimRootFilterAst: Filter,
  getAttributeField: (attr: string) => string | null,
  depth = 0
) => {
  if (depth > 20) return;

  const stack = [
    {
      scimFilterAst: scimRootFilterAst,
      query: rootQuery
    }
  ];

  while (stack.length) {
    const { scimFilterAst, query } = stack.pop()!;
    switch (scimFilterAst.op) {
      case "eq": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.where(attrPath, scimFilterAst.compValue);
        break;
      }
      case "pr": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.whereNotNull(attrPath);
        break;
      }
      case "gt": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.where(attrPath, ">", scimFilterAst.compValue);
        break;
      }
      case "ge": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.where(attrPath, ">=", scimFilterAst.compValue);
        break;
      }
      case "lt": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.where(attrPath, "<", scimFilterAst.compValue);
        break;
      }
      case "le": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.where(attrPath, "<=", scimFilterAst.compValue);
        break;
      }
      case "sw": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.whereILike(attrPath, `${scimFilterAst.compValue}%`);
        break;
      }
      case "ew": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.whereILike(attrPath, `%${scimFilterAst.compValue}`);
        break;
      }
      case "co": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.whereILike(attrPath, `%${scimFilterAst.compValue}%`);
        break;
      }
      case "ne": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.whereNot(attrPath, "=", scimFilterAst.compValue);
        break;
      }
      case "and": {
        scimFilterAst.filters.forEach((el) => {
          void query.andWhere((subQueryBuilder) => {
            processDynamicQuery(subQueryBuilder, el, getAttributeField, depth + 1);
          });
        });
        break;
      }
      case "or": {
        scimFilterAst.filters.forEach((el) => {
          void query.orWhere((subQueryBuilder) => {
            processDynamicQuery(subQueryBuilder, el, getAttributeField, depth + 1);
          });
        });
        break;
      }
      case "not": {
        void query.whereNot((subQueryBuilder) => {
          processDynamicQuery(subQueryBuilder, scimFilterAst.filter, getAttributeField, depth + 1);
        });
        break;
      }
      case "[]": {
        void query.where((subQueryBuilder) => {
          processDynamicQuery(
            subQueryBuilder,
            appendParentToGroupingOperator(scimFilterAst.attrPath, scimFilterAst.valFilter),
            getAttributeField,
            depth + 1
          );
        });
        break;
      }
      default:
        break;
    }
  }
};

export const generateKnexQueryFromScim = (
  rootQuery: Knex.QueryBuilder,
  rootScimFilter: string,
  getAttributeField: (attr: string) => string | null
) => {
  const scimRootFilterAst = parse(rootScimFilter);
  return processDynamicQuery(rootQuery, scimRootFilterAst, getAttributeField);
};
