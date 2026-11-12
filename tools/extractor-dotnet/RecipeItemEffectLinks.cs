using System.Globalization;

namespace WowTrader.Extractor;

internal static class RecipeItemEffectLinks
{
  public static IReadOnlyList<IReadOnlyDictionary<string, object?>> Expand(
      IReadOnlyList<IReadOnlyDictionary<string, object?>> effects,
      IReadOnlyList<IReadOnlyDictionary<string, object?>> links)
  {
    var byEffect = new Dictionary<int, HashSet<int>>();
    foreach (var link in links)
    {
      var effectId = PositiveId(link, "ItemEffectID");
      var itemId = PositiveId(link, "ItemID");
      if (effectId == 0 || itemId == 0) continue;
      if (!byEffect.TryGetValue(effectId, out var items)) byEffect[effectId] = items = [];
      items.Add(itemId);
    }
    var result = new List<IReadOnlyDictionary<string, object?>>();
    foreach (var effect in effects)
    {
      var parents = new HashSet<int>();
      var legacy = PositiveId(effect, "ParentItemID");
      if (legacy > 0) parents.Add(legacy);
      if (byEffect.TryGetValue(PositiveId(effect, "id"), out var linked)) parents.UnionWith(linked);
      if (parents.Count == 0) { result.Add(effect); continue; }
      foreach (var parent in parents.Order())
      {
        var resolved = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var pair in effect) resolved.Add(pair.Key, pair.Value);
        resolved["ParentItemID"] = parent;
        result.Add(resolved);
      }
    }
    return result;
  }

  private static int PositiveId(IReadOnlyDictionary<string, object?> row, string key) =>
      row.TryGetValue(key, out var value) &&
      int.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Integer,
          CultureInfo.InvariantCulture, out var id) && id > 0 ? id : 0;
}
