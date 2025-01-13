import * as pkcs11js from "pkcs11js";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { HsmModule } from "./hsm-types";

export const initializeHsmModule = () => {
  const appCfg = getConfig();

  // Create a new instance of PKCS11 module
  const pkcs11 = new pkcs11js.PKCS11();
  let isInitialized = false;

  const initialize = () => {
    if (!appCfg.isHsmConfigured) {
      return;
    }

    try {
      // Load the PKCS#11 module
      pkcs11.load(appCfg.HSM_LIB_PATH!);

      // Initialize the module
      pkcs11.C_Initialize();
      isInitialized = true;

      logger.info("PKCS#11 module initialized");
    } catch (err) {
      logger.error(err, "Failed to initialize PKCS#11 module");
      throw err;
    }
  };

  const finalize = () => {
    if (isInitialized) {
      try {
        pkcs11.C_Finalize();
        isInitialized = false;
        logger.info("PKCS#11 module finalized");
      } catch (err) {
        logger.error(err, "Failed to finalize PKCS#11 module");
        throw err;
      }
    }
  };

  const getModule = (): HsmModule => ({
    pkcs11,
    isInitialized
  });

  return {
    initialize,
    finalize,
    getModule
  };
};
