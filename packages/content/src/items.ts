/** Item registry. Gatherables are deliberately NOT stackable — a filling
 * inventory and the walk back to the bank is the core loop. */

export interface ItemDef {
  id: string;
  name: string;
  stackable: boolean;
  /** rough vendor value in BLOCK * 1e-8 units later; relative for now */
  value: number;
  /** icon tint for the placeholder UI tiles */
  tint: string;
}

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  (
    [
      // logs
      { id: "alder_log", name: "Alderwood log", value: 4, tint: "#8a5a33" },
      { id: "ember_log", name: "Emberbirch log", value: 11, tint: "#a3512e" },
      { id: "willow_log", name: "Silverwillow log", value: 24, tint: "#9aa4ad" },
      { id: "yew_log", name: "Duskyew log", value: 60, tint: "#4a3d5c" },
      // ores
      { id: "copper_ore", name: "Copper ore", value: 5, tint: "#b87333" },
      { id: "iron_ore", name: "Iron ore", value: 14, tint: "#8a8d91" },
      { id: "coal", name: "Blackstone coal", value: 22, tint: "#2e2b29" },
      { id: "mithril_ore", name: "Mithril ore", value: 55, tint: "#5b7fd4" },
      { id: "adamant_ore", name: "Adamant ore", value: 90, tint: "#3e8e5a" },
      { id: "runestone", name: "Runestone", value: 150, tint: "#7b4fd0" },
      // crafting gatherables
      { id: "marsh_reed", name: "Marsh reed", value: 3, tint: "#5d7a4a" },
      { id: "sunbloom", name: "Sunbloom", value: 6, tint: "#e8c33a" },
    ] as Omit<ItemDef, "stackable">[]
  ).map((i) => [i.id, { ...i, stackable: false }]),
);

export const INVENTORY_SLOTS = 28;
export const BANK_SLOTS = 400;
