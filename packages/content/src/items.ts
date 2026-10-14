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
  /** equipable gear */
  equip?: { slot: "weapon"; tier: number; model: string };
  /** food: hp restored when eaten */
  heal?: number;
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
      // fish
      { id: "silver_darter", name: "Silver darter", value: 6, tint: "#b8c4cc" },
      { id: "mudwhisker", name: "Mudwhisker", value: 16, tint: "#6b5a3e" },
      { id: "emberfin", name: "Emberfin", value: 40, tint: "#d4683a" },
      // bars
      { id: "copper_bar", name: "Copper bar", value: 12, tint: "#c98a4b" },
      { id: "iron_bar", name: "Iron bar", value: 30, tint: "#9aa0a6" },
      { id: "steel_bar", name: "Steel bar", value: 60, tint: "#c3cbd4" },
      { id: "mithril_bar", name: "Mithril bar", value: 120, tint: "#7295e0" },
      { id: "adamant_bar", name: "Adamant bar", value: 190, tint: "#57a476" },
      { id: "runic_bar", name: "Runic bar", value: 320, tint: "#9268e0" },
      // crafting gatherables
      { id: "marsh_reed", name: "Marsh reed", value: 3, tint: "#5d7a4a" },
      { id: "sunbloom", name: "Sunbloom", value: 6, tint: "#e8c33a" },
    ] as Omit<ItemDef, "stackable">[]
  ).map((i) => [i.id, { ...i, stackable: false }]),
);

// equipable weapons (model = committed GLB in assets/out/gear)
const WEAPONS: ItemDef[] = [
  { id: "copper_sword", name: "Copper sword", value: 30, tint: "#b87333", stackable: false, equip: { slot: "weapon", tier: 1, model: "sword_arming_copper_s1000" } },
  { id: "iron_sword", name: "Iron sword", value: 80, tint: "#8a8d91", stackable: false, equip: { slot: "weapon", tier: 2, model: "sword_arming_iron_s1010" } },
  { id: "steel_sword", name: "Steel sword", value: 160, tint: "#b8c0c8", stackable: false, equip: { slot: "weapon", tier: 3, model: "sword_arming_steel_s1020" } },
  { id: "mithril_sword", name: "Mithril sword", value: 320, tint: "#5b7fd4", stackable: false, equip: { slot: "weapon", tier: 4, model: "sword_arming_mithril_s1030" } },
  { id: "adamant_sword", name: "Adamant sword", value: 520, tint: "#3e8e5a", stackable: false, equip: { slot: "weapon", tier: 5, model: "sword_arming_adamant_s1040" } },
  { id: "runic_sword", name: "Runic sword", value: 900, tint: "#7b4fd0", stackable: false, equip: { slot: "weapon", tier: 6, model: "sword_arming_runic_s1050" } },
];
const FOOD: ItemDef[] = [
  { id: "cooked_darter", name: "Roasted darter", value: 10, tint: "#d8b06a", stackable: false, heal: 7 },
  { id: "cooked_mudwhisker", name: "Roasted mudwhisker", value: 26, tint: "#b98b50", stackable: false, heal: 14 },
  { id: "cooked_emberfin", name: "Roasted emberfin", value: 60, tint: "#e08a4a", stackable: false, heal: 24 },
];
for (const it of [...WEAPONS, ...FOOD]) ITEMS[it.id] = it;

export const INVENTORY_SLOTS = 28;
export const BANK_SLOTS = 400;
