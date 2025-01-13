import picomatch from "picomatch";
import { z } from "zod";

import { PermissionConditionOperators } from "@app/lib/casl";

export const PermissionConditionSchema = {
  [PermissionConditionOperators.$IN]: z.string().trim().min(1).array(),
  [PermissionConditionOperators.$ALL]: z.string().trim().min(1).array(),
  [PermissionConditionOperators.$REGEX]: z
    .string()
    .min(1)
    .refine(
      (el) => {
        try {
          // eslint-disable-next-line no-new
          new RegExp(el);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid regex pattern" }
    ),
  [PermissionConditionOperators.$EQ]: z.string().min(1),
  [PermissionConditionOperators.$NEQ]: z.string().min(1),
  [PermissionConditionOperators.$GLOB]: z
    .string()
    .min(1)
    .refine(
      (el) => {
        try {
          picomatch.parse([el]);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid glob pattern" }
    )
};
