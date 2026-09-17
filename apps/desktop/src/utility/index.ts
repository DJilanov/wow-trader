import { DefaultCompanionService, type CompanionService } from "@wow-trader/companion-core";

import {
  utilityCommandSchema,
  utilityEventSchema,
  type UtilityCommand,
  type UtilityEvent,
} from "../shared/contracts.js";

interface ParentMessageEvent {
  readonly data: unknown;
}

const parentPort = process.parentPort;
let service: CompanionService | null = null;
let unsubscribe: (() => void) | null = null;

if (!parentPort) throw new Error("The companion utility must be launched by Electron");

parentPort.on("message", (event: ParentMessageEvent) => {
  void handleCommand(event.data).catch((error: unknown) => {
    post({
      type: "error",
      code: "utility_command_failed",
      message: error instanceof Error ? error.message : "Unknown utility process failure",
    });
  });
});
post({ type: "ready" });

async function handleCommand(value: unknown): Promise<void> {
  const command = utilityCommandSchema.parse(value);
  if (command.type === "configure") {
    await service?.stop();
    unsubscribe?.();
    service = new DefaultCompanionService({
      endpoint: new URL(command.endpoint),
      statePath: command.statePath,
      products: command.products,
      automaticUploads: command.automaticUploads,
      apiKey: command.credential,
    });
    unsubscribe = service.subscribe((snapshot) => post({ type: "snapshot", snapshot }));
    await service.start();
    return;
  }
  if (!service) throw new Error("The companion utility is not configured");
  await applyServiceCommand(service, command);
}

async function applyServiceCommand(
  activeService: CompanionService,
  command: Exclude<UtilityCommand, { readonly type: "configure" }>,
): Promise<void> {
  switch (command.type) {
    case "check_now":
      await activeService.checkNow();
      break;
    case "retry":
      await activeService.retryFailed();
      break;
    case "set_automatic":
      await activeService.setAutomaticUploads(command.enabled);
      break;
    case "set_credential":
      await activeService.setCredential(command.credential);
      break;
    case "update_products":
      await activeService.updateProducts(command.products);
      break;
    case "stop":
      await activeService.stop();
      break;
  }
}

function post(event: UtilityEvent): void {
  parentPort.postMessage(utilityEventSchema.parse(event));
}
