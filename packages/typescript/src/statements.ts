import { MemoriesNamespace, MemoryRelationsNamespace } from "./memories.js";

/**
 * @deprecated Use `MemoryRelationsNamespace` instead. Retained for full backward compatibility.
 */
export class StatementRelationsNamespace extends MemoryRelationsNamespace {}

/**
 * @deprecated Use `MemoriesNamespace` instead. Retained for full backward compatibility.
 */
export class StatementsNamespace extends MemoriesNamespace {
  protected override readonly endpointName = "statements";
}
