using System.Security.Cryptography;
using System.Text.Json;

namespace WowTrader.Extractor;

internal static class ValuationSnapshotCommand
{
  public static void Run(CliOptions options)
  {
    var productDirectory = options.Product switch
    {
      "wowf" => "_forever_",
      "wow_classic_beta" => "_classic_beta_",
      "wow_anniversary" => "_anniversary_",
      _ => throw new InvalidOperationException("Unsupported valuation product")
    };
    var buildInfo = Path.Combine(options.WowRoot, ".build.info");
    var initialBuildHash = Hash(buildInfo);
    var sourceHotfix = Path.Combine(options.WowRoot, productDirectory, "Cache", "ADB", options.Locale, "DBCache.bin");
    if (!File.Exists(sourceHotfix)) throw new FileNotFoundException("A current hotfix cache is required");
    var hotfixHash = Hash(sourceHotfix);
    Directory.CreateDirectory(options.OutputDirectory);
    var staging = Path.Combine(options.OutputDirectory, $".valuation-staging-{Guid.NewGuid():N}");
    Directory.CreateDirectory(staging);
    try
    {
      var frozenHotfix = Path.Combine(staging, "DBCache.bin");
      File.Copy(sourceHotfix, frozenHotfix);
      if (Hash(frozenHotfix) != hotfixHash) throw new IOException("Hotfix cache changed during capture");
      string[] names = ["Item", "ItemSparse", "ItemDisenchantLoot", "SpellCooldowns"];
      var (build, db2) = new CascTableExtractor(options).Extract(names, staging);
      var reader = new Db2TableReader(db2, options.DefinitionsDirectory, build.ClientVersion, frozenHotfix);
      var tables = names.Select(reader.Read).ToArray();
      if (tables.Any(table => table.EffectiveRows.Count == 0))
        throw new InvalidDataException("A required valuation table is empty");
      if (Hash(buildInfo) != initialBuildHash || Hash(sourceHotfix) != hotfixHash)
        throw new IOException("Client or hotfix changed during extraction; retry after patching finishes");
      var report = new
      {
        schema = "item-valuation-client.v1",
        capturedAt = DateTimeOffset.UtcNow,
        build,
        options.DefinitionsRevision,
        hotfixSha256 = hotfixHash,
        tables = tables.ToDictionary(table => table.Name, table => new
        {
          rows = table.EffectiveRows,
          encryptedRecords = table.EncryptedRecordCount
        }),
        note = "Client eligibility, item flags and cooldowns only. Disenchant loot probabilities are not present."
      };
      var json = JsonSerializer.Serialize(report, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
      File.WriteAllText(Path.Combine(staging, "evidence.json"), json);
      File.Delete(frozenHotfix);
      Directory.Delete(db2, recursive: true);
      var destination = Path.Combine(options.OutputDirectory, $"valuation-{build.BuildNumber}-{DateTime.UtcNow:yyyyMMddTHHmmssZ}-{Guid.NewGuid():N}");
      Directory.Move(staging, destination);
      Console.WriteLine($"Valuation evidence: {Path.Combine(destination, "evidence.json")}");
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
