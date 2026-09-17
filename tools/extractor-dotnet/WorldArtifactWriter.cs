using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace WowTrader.Extractor;

internal sealed class WorldArtifactWriter
{
  private static readonly JsonSerializerOptions CompactJson = new()
  {
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
  };

  private static readonly JsonSerializerOptions IndentedJson = new(CompactJson)
  {
    WriteIndented = true,
  };

  private readonly string directory;

  public WorldArtifactWriter(string directory)
  {
    this.directory = directory;
  }

  public WorldSnapshotManifest Write(
      BuildMetadata build,
      CliOptions options,
      string hotfixStatus,
      string? hotfixHash,
      IReadOnlyDictionary<string, Db2TableSnapshot> tables,
      NormalizedWorld world,
      MapMediaManifest mediaManifest)
  {
    var rawArtifacts = new SortedDictionary<string, ArtifactDescriptor>(StringComparer.Ordinal);
    foreach (var table in tables.Values.OrderBy(table => table.Name, StringComparer.Ordinal))
    {
      rawArtifacts[$"{table.Name}.base"] = WriteNdjson(
          $"raw/{table.Name}.base.ndjson.gz",
          table.BaseRows);
      rawArtifacts[$"{table.Name}.effective"] = WriteNdjson(
          $"raw/{table.Name}.effective.ndjson.gz",
          table.EffectiveRows);
    }

    var normalizedArtifacts = new SortedDictionary<string, ArtifactDescriptor>(StringComparer.Ordinal)
    {
      ["maps"] = WriteNdjson("normalized/maps.ndjson.gz", world.Maps),
      ["areas"] = WriteNdjson("normalized/areas.ndjson.gz", world.Areas),
      ["ui-maps"] = WriteNdjson("normalized/ui-maps.ndjson.gz", world.UiMaps),
      ["ui-map-assignments"] = WriteNdjson(
            "normalized/ui-map-assignments.ndjson.gz",
            world.UiMapAssignments),
      ["map-arts"] = WriteNdjson("normalized/map-arts.ndjson.gz", world.MapArts),
      ["ui-map-art-links"] = WriteNdjson(
            "normalized/ui-map-art-links.ndjson.gz",
            world.UiMapArtLinks),
      ["map-art-layers"] = WriteNdjson(
            "normalized/map-art-layers.ndjson.gz",
            world.MapArtLayers),
      ["map-art-tiles"] = WriteNdjson(
            "normalized/map-art-tiles.ndjson.gz",
            world.MapArtTiles),
      ["pois"] = WriteNdjson("normalized/pois.ndjson.gz", world.Pois),
      ["encounters"] = WriteNdjson("normalized/encounters.ndjson.gz", world.Encounters),
      ["lfg-dungeons"] = WriteNdjson(
            "normalized/lfg-dungeons.ndjson.gz",
            world.LfgDungeons),
      ["quests"] = WriteNdjson("normalized/quests.ndjson.gz", world.Quests),
      ["quest-lines"] = WriteNdjson("normalized/quest-lines.ndjson.gz", world.QuestLines),
      ["quest-line-members"] = WriteNdjson(
            "normalized/quest-line-members.ndjson.gz",
            world.QuestLineMembers),
      ["quest-pois"] = WriteNdjson("normalized/quest-pois.ndjson.gz", world.QuestPois),
      ["item-source-hints"] = WriteNdjson(
            "normalized/item-source-hints.ndjson.gz",
            world.ItemSourceHints),
      ["creature-objectives"] = WriteNdjson(
            "normalized/creature-objectives.ndjson.gz",
            world.CreatureObjectives),
      ["bosses"] = WriteNdjson("normalized/bosses.ndjson.gz", world.Bosses),
      ["boss-locations"] = WriteNdjson(
            "normalized/boss-locations.ndjson.gz",
            world.BossLocations),
      ["creature-models"] = WriteNdjson(
            "normalized/creature-models.ndjson.gz",
            world.CreatureModels),
      ["boss-spell-candidates"] = WriteNdjson(
            "normalized/boss-spell-candidates.ndjson.gz",
            world.BossSpellCandidates),
      ["loot-source-candidates"] = WriteNdjson(
            "normalized/loot-source-candidates.ndjson.gz",
            world.LootSourceCandidates),
      ["map-difficulties"] = WriteNdjson(
            "normalized/map-difficulties.ndjson.gz",
            world.MapDifficulties),
      ["content-tunings"] = WriteNdjson(
            "normalized/content-tunings.ndjson.gz",
            world.ContentTunings),
    };

    var mediaDescriptor = WriteJsonArtifact("map-media-manifest.json", mediaManifest, mediaManifest.Tiles.Count);
    var manifest = new WorldSnapshotManifest(
        "world-snapshot-manifest.v1",
        build.Product,
        build.ClientVersion,
        build.BuildNumber,
        build.BuildKey,
        build.CdnKey,
        options.Locale,
        DateTimeOffset.UtcNow,
        new HotfixManifest(hotfixStatus, hotfixHash),
        new DefinitionsManifest("wowdev/WoWDBDefs", options.DefinitionsRevision),
        new ExtractorManifest(
            "wow-trader-world-extractor",
            WorldSnapshotCommand.ExtractorVersion,
            options.ExtractorRevision),
        rawArtifacts,
        normalizedArtifacts,
        mediaDescriptor);
    WriteJson("manifest.json", manifest);
    WriteChecksums(
        rawArtifacts.Values
            .Concat(normalizedArtifacts.Values)
            .Append(mediaDescriptor)
            .Concat(mediaManifest.Tiles.Select(tile => new ArtifactDescriptor(tile.Path, 1, tile.Sha256))));
    return manifest;
  }

  private ArtifactDescriptor WriteNdjson<T>(string relativePath, IReadOnlyList<T> records)
  {
    var outputPath = Path.Combine(directory, relativePath);
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
    using (var file = new FileStream(outputPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
    using (var gzip = new GZipStream(file, CompressionLevel.SmallestSize, leaveOpen: false))
    using (var writer = new StreamWriter(gzip, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false)))
    {
      writer.NewLine = "\n";
      if (records.Count == 0) writer.WriteLine();
      foreach (var record in records) writer.WriteLine(JsonSerializer.Serialize(record, CompactJson));
    }
    return new ArtifactDescriptor(
        relativePath.Replace(Path.DirectorySeparatorChar, '/'),
        records.Count,
        Sha256File(outputPath));
  }

  private ArtifactDescriptor WriteJsonArtifact<T>(string relativePath, T value, int recordCount)
  {
    WriteJson(relativePath, value);
    return new ArtifactDescriptor(relativePath, recordCount, Sha256File(Path.Combine(directory, relativePath)));
  }

  private void WriteJson<T>(string relativePath, T value)
  {
    var path = Path.Combine(directory, relativePath);
    File.WriteAllText(
        path,
        JsonSerializer.Serialize(value, IndentedJson) + "\n",
        new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
  }

  private void WriteChecksums(IEnumerable<ArtifactDescriptor> artifacts)
  {
    var paths = artifacts.Select(artifact => artifact.Path)
        .Append("manifest.json")
        .Distinct(StringComparer.Ordinal)
        .Order(StringComparer.Ordinal);
    var lines = paths.Select(path => $"{Sha256File(Path.Combine(directory, path))}  {path}");
    File.WriteAllText(
        Path.Combine(directory, "checksums.sha256"),
        string.Join('\n', lines) + "\n",
        new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
  }

  private static string Sha256File(string path)
  {
    using var stream = File.OpenRead(path);
    return Convert.ToHexStringLower(SHA256.HashData(stream));
  }
}
