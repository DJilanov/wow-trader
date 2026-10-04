using System.Security.Cryptography;
using System.Text.Json;

namespace WowTrader.Extractor;

internal static class LevelingEvidenceCommand
{
  public static void Run(CliOptions options)
  {
    if (options.Product != "wow_classic_beta")
      throw new InvalidOperationException("Leveling evidence requires wow_classic_beta");
    Directory.CreateDirectory(options.OutputDirectory);
    var destination = Path.Combine(options.OutputDirectory, $"leveling-{DateTime.UtcNow:yyyyMMddTHHmmssZ}");
    if (Directory.Exists(destination)) throw new IOException("Evidence destination already exists");
    Directory.CreateDirectory(destination);
    var (build, tablesDirectory) = new CascTableExtractor(options).Extract(
        ["QuestV2", "QuestXP"], destination, additionalFiles: ["gametables/xp.txt"]);
    var hotfixPath = Path.Combine(options.WowRoot, "_classic_beta_", "Cache", "ADB", options.Locale, "DBCache.bin");
    if (!File.Exists(hotfixPath)) throw new FileNotFoundException("Current hotfix cache is required");
    var reader = new Db2TableReader(tablesDirectory, options.DefinitionsDirectory, build.ClientVersion, hotfixPath);
    int[] questIds = [9, 22, 38, 64, 65, 102, 103, 132, 135, 141, 142, 151, 153, 155, 166, 167, 168, 214,
        2040, 92742, 92744, 92745, 92747, 92748, 92749, 92750, 92751, 92752, 92753,
        96391, 96393, 96394, 96395, 96403, 98423];
    var quests = reader.Read("QuestV2");
    var xp = reader.Read("QuestXP");
    var report = new
    {
      schemaVersion = "forever-leveling-evidence.v1",
      capturedAt = DateTime.UtcNow,
      build,
      definitionsRevision = options.DefinitionsRevision,
      hotfixSha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(hotfixPath))),
      xpFileSha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Path.Combine(destination, "xp.txt")))),
      quests.EncryptedRecordCount,
      requestedQuestIds = questIds,
      questRows = quests.EffectiveRows.Where(row => questIds.Contains(Convert.ToInt32(row["id"]))).ToArray(),
      questXpRows = xp.EffectiveRows,
      note = "QuestXP contains level/difficulty values, not individual quest reward or prerequisite bindings. GameTable values need runtime confirmation."
    };
    File.WriteAllText(Path.Combine(destination, "evidence.json"), JsonSerializer.Serialize(report,
        new JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
    Console.WriteLine($"Leveling evidence: {destination}");
  }
}
