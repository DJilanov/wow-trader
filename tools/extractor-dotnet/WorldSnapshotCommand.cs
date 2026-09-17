using System.Security.Cryptography;

namespace WowTrader.Extractor;

internal static class WorldSnapshotCommand
{
  internal const string ExtractorVersion = "0.2.3";

  private static readonly string[] TableNames =
  [
    "Map",
    "MapDifficulty",
    "Difficulty",
    "AreaTable",
    "UiMap",
    "UiMapAssignment",
    "UiMapArt",
    "UiMapArtStyleLayer",
    "UiMapArtTile",
    "UiMapXMapArt",
    "WorldMapOverlay",
    "WorldMapOverlayTile",
    "WMOMinimapTexture",
    "AreaPOI",
    "TaxiNodes",
    "GameObjects",
    "DungeonEncounter",
    "LFGDungeons",
    "Achievement",
    "Criteria",
    "CriteriaTree",
    "ModifierTree",
    "ContentTuning",
    "Creature",
    "CreatureDifficulty",
    "CreatureXDisplayInfo",
    "CreatureDisplayInfo",
    "CreatureModelData",
    "ModelFileData",
    "Spell",
    "SpellName",
    "SpellEffect",
    "SpellMisc",
    "CollectableSourceInfo",
    "ItemModifiedAppearance",
    "QuestV2",
    "QuestInfo",
    "QuestLine",
    "QuestLineXQuest",
    "QuestPOIBlob",
    "QuestPOIPoint",
  ];

  public static void Run(CliOptions options)
  {
    Directory.CreateDirectory(options.OutputDirectory);
    var stagingDirectory = Path.Combine(
        options.OutputDirectory,
        $".world-snapshot-staging-{Guid.NewGuid():N}");
    Directory.CreateDirectory(stagingDirectory);

    try
    {
      var hotfixPath = FindHotfixPath(options);
      var hotfixHash = hotfixPath is null ? null : Sha256File(hotfixPath);
      var hotfixStatus = hotfixPath is null ? "missing" : "applied";
      Console.WriteLine(hotfixPath is null
          ? "No DBCache.bin found; the world snapshot will remain review-required"
          : $"Using hotfix cache {hotfixPath} ({hotfixHash})");

      var extractor = new CascTableExtractor(options);
      var (build, db2Directory) = extractor.Extract(TableNames, stagingDirectory);
      var reader = new Db2TableReader(
          db2Directory,
          options.DefinitionsDirectory,
          build.ClientVersion,
          hotfixPath);
      var tables = new SortedDictionary<string, Db2TableSnapshot>(StringComparer.Ordinal);
      foreach (var tableName in TableNames)
      {
        var table = reader.Read(tableName);
        tables.Add(tableName, table);
        Console.WriteLine(
            $"Parsed {tableName}: {table.BaseRows.Count:N0} base / " +
            $"{table.EffectiveRows.Count:N0} effective rows; " +
            $"{table.EncryptedRecordCount:N0} encrypted records");
      }

      Directory.Delete(db2Directory, recursive: true);
      var world = new WorldNormalizer(tables).Normalize();
      var mediaManifest = new MapMediaExtractor().Extract(
          options,
          build,
          world.MapArtTiles,
          stagingDirectory);
      new WorldArtifactWriter(stagingDirectory).Write(
          build,
          options,
          hotfixStatus,
          hotfixHash,
          tables,
          world,
          mediaManifest);

      var snapshotDirectory = Path.Combine(
          options.OutputDirectory,
          "world-snapshots",
          build.Product,
          build.BuildNumber.ToString(),
          options.Locale,
          hotfixHash ?? "missing-hotfix",
          "world-snapshot-manifest.v1",
          $"extractor-{ExtractorVersion}");
      if (Directory.Exists(snapshotDirectory))
      {
        throw new IOException($"World snapshot directory already exists: {snapshotDirectory}");
      }
      Directory.CreateDirectory(Path.GetDirectoryName(snapshotDirectory)!);
      Directory.Move(stagingDirectory, snapshotDirectory);

      Console.WriteLine($"World snapshot: {snapshotDirectory}");
      Console.WriteLine(
          $"World: {world.Maps.Count:N0} maps, {world.UiMaps.Count:N0} UI maps, " +
          $"{world.MapArtTiles.Count:N0} map tiles, {world.Encounters.Count:N0} encounters, " +
          $"{world.Bosses.Count:N0} criteria-backed bosses, " +
          $"{world.Quests.Count:N0} quest IDs, {world.ItemSourceHints.Count:N0} item source hints");
      Console.WriteLine(
          $"Map media: {mediaManifest.Tiles.Count:N0} decoded, " +
          $"{mediaManifest.UnavailableTiles.Count:N0} unavailable");
    }
    catch
    {
      if (Directory.Exists(stagingDirectory)) Directory.Delete(stagingDirectory, recursive: true);
      throw;
    }
  }

  private static string? FindHotfixPath(CliOptions options)
  {
    foreach (var flavorPath in Directory.EnumerateFiles(
                 options.WowRoot,
                 ".flavor.info",
                 SearchOption.AllDirectories))
    {
      var lines = File.ReadAllLines(flavorPath);
      if (lines.Length < 2 || !string.Equals(lines[1], options.Product, StringComparison.Ordinal)) continue;
      var productDirectory = Path.GetDirectoryName(flavorPath)!;
      var hotfixPath = Path.Combine(productDirectory, "Cache", "ADB", options.Locale, "DBCache.bin");
      return File.Exists(hotfixPath) ? hotfixPath : null;
    }
    return null;
  }

  private static string Sha256File(string path)
  {
    using var stream = File.OpenRead(path);
    return Convert.ToHexStringLower(SHA256.HashData(stream));
  }
}
