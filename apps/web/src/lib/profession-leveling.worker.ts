import { buildProfessionLevelingPlan } from "./profession-leveling";
import type {
  ProfessionLevelingData,
  ProfessionLevelingOptions,
  ProfessionLevelingPlan,
} from "./profession-leveling-types";

export interface LevelingWorkerRequest {
  readonly data: Pick<ProfessionLevelingData, "recipes" | "items">;
  readonly options: ProfessionLevelingOptions;
}
export type LevelingWorkerResponse =
  { readonly plan: ProfessionLevelingPlan } | { readonly error: string };

const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LevelingWorkerRequest>) => void) | null;
  postMessage: (value: LevelingWorkerResponse) => void;
};
worker.onmessage = (event: MessageEvent<LevelingWorkerRequest>): void => {
  try {
    worker.postMessage({ plan: buildProfessionLevelingPlan(event.data.data, event.data.options) });
  } catch (error: unknown) {
    worker.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Could not calculate this route. Try a shorter skill range.",
    });
  }
};
