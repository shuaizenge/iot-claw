import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { createIotClawTools } from "./src/tools.js";

export default definePluginEntry({
  id: "iot-claw",
  name: "iot-claw Control Plane",
  description: "Operate an iot-claw control plane through native OpenClaw tools.",
  register(api: OpenClawPluginApi) {
    for (const tool of createIotClawTools(api)) {
      api.registerTool(tool);
    }
  },
});
