using WowTrader.Extractor;

var controls = 0;
void Quantity(Dictionary<string, object?> input, (int, int, int, int) expected)
{
  if (RecipeQuantity.Resolve(input) != expected) throw new Exception("Incorrect output quantity");
  controls++;
}
void Unsupported(Dictionary<string, object?> input)
{
  try { RecipeQuantity.Resolve(input); throw new Exception("Unsupported quantity was accepted"); }
  catch (InvalidDataException) { controls++; }
}
Quantity(new() { ["EffectBasePoints"] = 0, ["EffectDieSides"] = 1 }, (1, 1, 1, 1));
Quantity(new() { ["EffectBasePoints"] = 1, ["EffectDieSides"] = 1 }, (2, 2, 2, 1));
Quantity(new() { ["EffectBasePoints"] = 0, ["EffectDieSides"] = 2 }, (1, 2, 3, 2));
Quantity(new() { ["EffectBasePointsF"] = 0 }, (1, 1, 1, 1));
Quantity(new() { ["EffectBasePointsF"] = 1 }, (1, 1, 1, 1));
Quantity(new() { ["EffectBasePointsF"] = 2 }, (2, 2, 2, 1));
Quantity(new() { ["EffectBasePointsF"] = 200 }, (200, 200, 200, 1));
Quantity(new() { ["EffectBasePointsF"] = 2, ["Variance"] = 1 }, (1, 3, 2, 1));
Quantity(new() { ["EffectBasePointsF"] = 3, ["Variance"] = 0.6666667f }, (2, 4, 3, 1));
Quantity(new() { ["EffectBasePointsF"] = 3, ["Variance"] = 1.3333334f }, (1, 5, 3, 1));
Unsupported(new() { ["EffectBasePointsF"] = 1.5 });
Unsupported(new() { ["EffectBasePointsF"] = 2, ["Coefficient"] = 1 });
Unsupported(new() { ["EffectBasePointsF"] = double.NaN });
Unsupported(new() { ["EffectBasePointsF"] = 2, ["Variance"] = 0.1 });

var root = Path.Combine(Path.GetTempPath(), "catalog-product-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
var file = Path.Combine(root, ".build.info");
void Product(string rows, string requested, string expected)
{
  File.WriteAllText(file, "Product!STRING:0|Version!STRING:0|Active!DEC:1\n" + rows);
  if (InstalledProduct.Resolve(root, requested) != expected) throw new Exception("Product mismatch");
  controls++;
}
try
{
  Product("wowf|1.60.1.70790|1\n", "wow_classic_beta", "wowf");
  Product("wow_classic_beta|1.60.1.70532|1\n", "wow_classic_beta", "wow_classic_beta");
  Product("wowf|1.60.1.70790|0\nwow_classic_beta|1.60.1.70532|1\n", "wow_classic_beta", "wow_classic_beta");
  Product("wowf|1.60.1.70790|1\nwow_classic_beta|1.60.1.70532|1\n", "wow_classic_beta", "wowf");
  Product("wowf|1.60.1.70790|1\n", "wowf", "wowf");
  Product("wowf|1.60.1.70790|1\n", "wow_anniversary", "wow_anniversary");
  File.WriteAllText(file, "Product|Active\nwowf|1\nwowf|1\n");
  try { InstalledProduct.Resolve(root, "wow_classic_beta"); throw new Exception("Duplicate accepted"); }
  catch (InvalidDataException) { controls++; }
  File.WriteAllText(file, "bad headers\n");
  try { InstalledProduct.Resolve(root, "wow_classic_beta"); throw new Exception("Bad headers accepted"); }
  catch (InvalidDataException) { controls++; }
}
finally { Directory.Delete(root, recursive: true); }

NormalizedCatalog Normalize(Dictionary<string, object?> quantity, int? teachingTrigger = null)
{
  IReadOnlyDictionary<string, object?>[] Rows(Dictionary<string, object?> row) => [row];
  var data = new Dictionary<string, IReadOnlyList<IReadOnlyDictionary<string, object?>>>
  {
    ["ItemSparse"] = Rows(new() { ["id"] = 2841, ["Display_lang"] = "Bronze Bar" }),
    ["SpellName"] = Rows(new() { ["id"] = 2659, ["Name_lang"] = "Smelt Bronze" }),
    ["SkillLine"] = Rows(new() { ["id"] = 186, ["DisplayName_lang"] = "Mining", ["CategoryID"] = 11 }),
    ["SkillLineAbility"] = Rows(new() { ["id"] = 1, ["Spell"] = 2659, ["SkillLine"] = 186 }),
  };
  foreach (var name in new[] {
      "Item", "ItemAppearance", "ItemModifiedAppearance", "ItemSearchName", "Spell", "SkillLine",
      "SpellReagents", "SpellLearnSpell", "ItemEffect", "SpellCooldowns", "SpellCategories", "SpellMisc",
      "SpellCastTimes", "SpellDuration", "SpellAuraOptions", "SpellDescriptionVariables", "SpellXDescriptionVariables",
      "ItemSet", "ItemSetSpell", "ChrClasses", "ChrRaces", "ItemClass", "ItemSubClass", "ItemLimitCategory",
      "GemProperties", "SpellItemEnchantment", "ItemRandomProperties", "ItemRandomSuffix", "ItemXBonusTree",
      "ItemBonusTreeNode", "ItemBonus" })
    data.TryAdd(name, []);
  quantity["id"] = 1;
  quantity["SpellID"] = 2659;
  quantity["Effect"] = 24;
  quantity["EffectItemType"] = 2841;
  data["SpellEffect"] = Rows(quantity);
  if (teachingTrigger is int trigger)
  {
    data["ItemSparse"] = [data["ItemSparse"][0], new Dictionary<string, object?> { ["id"] = 500, ["Display_lang"] = "Recipe item" }];
    data["ItemEffect"] = Rows(new() { ["id"] = 17, ["SpellID"] = 2659, ["TriggerType"] = trigger });
    data["ItemXItemEffect"] = Rows(new() { ["ItemEffectID"] = 17, ["ItemID"] = 500 });
  }
  var tables = data.ToDictionary(pair => pair.Key, pair => new Db2TableSnapshot(pair.Key, pair.Value, pair.Value, 0, 0));
  return new CatalogNormalizer(tables).Normalize();
}
var modern = Normalize(new() { ["EffectBasePointsF"] = 2 });
if (modern.RecipeOutputs.Single().ExpectedQuantityNumerator != 2) throw new Exception("Modern output not normalized");
controls++;
var legacy = Normalize(new() { ["EffectBasePoints"] = 1, ["EffectDieSides"] = 1 });
if (legacy.RecipeOutputs.Single().ExpectedQuantityNumerator != 2) throw new Exception("Legacy output not normalized");
controls++;
var unsupported = Normalize(new() { ["EffectBasePointsF"] = 3, ["Variance"] = 1 });
if (unsupported.Recipes.Count != 0 || unsupported.RecipeOutputs.Count != 0) throw new Exception("Unsupported output was fabricated");
controls++;
if (Normalize(new() { ["EffectBasePointsF"] = 1 }, 6).RecipeTeachingItems.Single().TeachingItemId != 500)
  throw new Exception("Modern learn-trigger item did not teach its recipe");
controls++;
if (Normalize(new() { ["EffectBasePointsF"] = 1 }, 0).RecipeTeachingItems.Count != 0)
  throw new Exception("An on-use output was incorrectly treated as a recipe book");
controls++;
Console.WriteLine($"{controls} .NET quantity and installed-product controls passed");
