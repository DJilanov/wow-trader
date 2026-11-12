using WowTrader.Extractor;

Dictionary<string, object?> Row(params (string Key, object? Value)[] fields) =>
    fields.ToDictionary(field => field.Key, field => field.Value);
void Check(bool value, string message) { if (!value) throw new Exception(message); }
var effect = Row(("id", 17), ("SpellID", 100));
var linked = RecipeItemEffectLinks.Expand([effect], [Row(("ItemEffectID", 17), ("ItemID", 500))]);
Check(Convert.ToInt32(linked.Single()["ParentItemID"]) == 500, "Modern item links were lost");
Check(!effect.ContainsKey("ParentItemID"), "The original evidence was mutated");
var legacy = Row(("id", 18), ("SpellID", 200), ("ParentItemID", 600));
Check(Convert.ToInt32(RecipeItemEffectLinks.Expand([legacy], []).Single()["ParentItemID"]) == 600, "Legacy parent lost");
var shared = RecipeItemEffectLinks.Expand([effect], [
    Row(("ItemEffectID", 17), ("ItemID", 500)), Row(("ItemEffectID", 17), ("ItemID", 501)),
    Row(("ItemEffectID", 17), ("ItemID", 500)), Row(("ItemEffectID", 17), ("ItemID", -1)),
    Row(("ItemEffectID", 19), ("ItemID", 999))]);
Check(shared.Select(row => Convert.ToInt32(row["ParentItemID"])).SequenceEqual([500, 501]), "Shared, duplicate or orphan links handled incorrectly");
Check(RecipeItemEffectLinks.Expand([effect], []).Single() == effect, "Unmapped evidence changed");
Check(RecipeItemEffectLinks.Expand([legacy], [Row(("ItemEffectID", 18), ("ItemID", 600))]).Count == 1, "Legacy/modern duplicate relation");
Console.WriteLine("6 legacy/modern recipe item-effect link controls passed");
