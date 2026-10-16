using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace WowTrader.Extractor;

internal static class MechanicsSnapshotCommand
{
  private static readonly string[] Tables =
  [
    "Item", "ItemSparse", "ItemSearchName", "RandPropPoints", "ItemEffect", "ItemXItemEffect",
    "ItemSet", "ItemSetSpell", "ItemLimitCategory", "ItemBonus", "ItemXBonusTree", "ItemBonusTreeNode",
    "ItemDamageOneHand", "ItemDamageOneHandCaster", "ItemDamageTwoHand", "ItemDamageTwoHandCaster",
    "ItemDamageRanged", "ItemDamageAmmo", "ItemArmorTotal", "ItemArmorQuality", "ItemArmorShield", "ArmorLocation",
    "TraitTree", "TraitNode", "TraitNodeEntry", "TraitNodeXTraitNodeEntry", "TraitDefinition",
    "TraitDefinitionEffectPoints", "TraitEdge", "TraitCond", "TraitNodeXTraitCond", "TraitNodeEntryXTraitCond",
    "TraitCost", "TraitNodeXTraitCost", "Curve", "CurvePoint", "ChrClasses", "ChrRaces", "GlobalStrings",
    "Spell", "SpellName", "SpellEffect", "SpellScaling", "SpellPower", "SpellMisc", "SpellClassOptions",
    "SpellAuraOptions", "SpellAuraRestrictions", "SpellCategories", "SpellCooldowns", "SpellCastTimes",
    "SpellDuration", "SpellRange", "SpellLevels", "SpellDescriptionVariables", "SpellXDescriptionVariables",
    "SpellItemEnchantment", "SpellEquippedItems",
  ];
  private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

  public static void Run(CliOptions options)
  {
    if (options.Product != "wow_classic_beta") throw new InvalidOperationException("Mechanics extraction requires Forever beta");
    Directory.CreateDirectory(options.OutputDirectory);
    var staging = Path.Combine(options.OutputDirectory, $".mechanics-staging-{Guid.NewGuid():N}");
    Directory.CreateDirectory(staging);
    try
    {
      var buildInfo = Path.Combine(options.WowRoot, ".build.info");
      var initialBuildHash = Hash(buildInfo);
      var sourceHotfix = Path.Combine(options.WowRoot, "_classic_beta_", "Cache", "ADB", options.Locale, "DBCache.bin");
      if (!File.Exists(sourceHotfix)) throw new FileNotFoundException("Current hotfix cache is required for mechanics evidence");
      var hotfixHash = Hash(sourceHotfix);
      var frozenHotfix = Path.Combine(staging, "DBCache.bin");
      File.Copy(sourceHotfix, frozenHotfix);
      if (Hash(frozenHotfix) != hotfixHash) throw new IOException("Hotfix cache changed during capture; retry after patching finishes");
      var (build, db2) = new CascTableExtractor(options).Extract(Tables, staging,
          tolerateUnavailableTables: true, additionalFiles: ["gametables/combatratings.txt"]);
      var reader = new Db2TableReader(db2, options.DefinitionsDirectory, build.ClientVersion, frozenHotfix);
      var artifacts = new SortedDictionary<string, object>(StringComparer.Ordinal);
      var unavailable = new List<string>();
      foreach (var name in Tables)
      {
        if (!File.Exists(Path.Combine(db2, name + ".db2"))) { unavailable.Add(name); continue; }
        Db2TableSnapshot table;
        try { table = reader.Read(name); }
        catch (Exception exception) { throw new InvalidDataException($"Cannot decode mechanics table {name}: {exception.Message}", exception); }
        foreach (var (suffix, rows) in new[] { ("base", table.BaseRows), ("effective", table.EffectiveRows) })
        {
          var relative = $"raw/{name}.{suffix}.ndjson.gz";
          var path = Path.Combine(staging, relative);
          Directory.CreateDirectory(Path.GetDirectoryName(path)!);
          using (var file = File.Create(path))
          using (var compressed = new GZipStream(file, CompressionLevel.SmallestSize))
          using (var writer = new StreamWriter(compressed, new UTF8Encoding(false)))
          {
            if (rows.Count == 0) writer.WriteLine();
            foreach (var row in rows) writer.WriteLine(JsonSerializer.Serialize(row, Json));
          }
          artifacts[$"{name}.{suffix}"] = new { path = relative, recordCount = rows.Count,
            sha256 = Hash(path), encryptedRecords = table.EncryptedRecordCount };
        }
        Console.WriteLine($"Mechanics {name}: {table.EffectiveRows.Count:N0} effective, {table.EncryptedRecordCount:N0} encrypted");
      }
      string[] required = ["Item", "ItemSparse", "RandPropPoints", "ItemSet", "ItemSetSpell",
        "TraitTree", "TraitNode", "TraitNodeEntry", "TraitNodeXTraitNodeEntry", "TraitDefinition",
        "TraitDefinitionEffectPoints", "TraitEdge", "CurvePoint", "Spell", "SpellName", "SpellEffect"];
      if (required.Any(name => !artifacts.ContainsKey(name + ".effective")))
        throw new InvalidDataException("Required mechanics tables are unavailable; no snapshot published");
      if (Hash(buildInfo) != initialBuildHash || Hash(sourceHotfix) != hotfixHash)
        throw new IOException("Client build or hotfix changed during extraction; no mixed snapshot published");
      var manifest = new { schema = "forever-mechanics-snapshot.v1", build, locale = options.Locale,
        definitionsRevision = options.DefinitionsRevision, capturedAt = DateTimeOffset.UtcNow,
        hotfixSha256 = hotfixHash, tables = artifacts, unavailable,
        combatRatings = new { path = "combatratings.txt", sha256 = Hash(Path.Combine(staging, "combatratings.txt")) } };
      File.WriteAllText(Path.Combine(staging, "manifest.json"), JsonSerializer.Serialize(manifest, Json));
      File.Delete(frozenHotfix);
      Directory.Delete(db2, recursive: true);
      var destination = Path.Combine(options.OutputDirectory, build.BuildNumber.ToString(), hotfixHash,
          $"mechanics-{DateTime.UtcNow:yyyyMMddTHHmmssZ}-{Guid.NewGuid():N}");
      Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
      Directory.Move(staging, destination);
      Console.WriteLine($"Mechanics snapshot: {destination}");
    }
    catch
    {
      if (Directory.Exists(staging)) Directory.Delete(staging, recursive: true);
      throw;
    }
  }

  private static string Hash(string path)
  {
    using var stream = File.OpenRead(path);
    return Convert.ToHexStringLower(SHA256.HashData(stream));
  }
}
