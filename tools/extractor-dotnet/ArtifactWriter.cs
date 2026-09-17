using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace WowTrader.Extractor;

internal sealed class ArtifactWriter
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

  public ArtifactWriter(string directory)
  {
    this.directory = directory;
  }

  public SnapshotManifest Write(
      BuildMetadata build,
      CliOptions options,
      string hotfixStatus,
      string? hotfixHash,
      IReadOnlyDictionary<string, Db2TableSnapshot> tables,
      NormalizedCatalog catalog,
      ValidationReport validationReport)
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
      ["items"] = WriteNdjson("normalized/items.ndjson.gz", catalog.Items),
      ["spells"] = WriteNdjson("normalized/spells.ndjson.gz", catalog.Spells),
      ["item-stats"] = WriteNdjson("normalized/item-stats.ndjson.gz", catalog.ItemStats),
      ["item-damages"] = WriteNdjson("normalized/item-damages.ndjson.gz", catalog.ItemDamages),
      ["item-resistances"] = WriteNdjson(
            "normalized/item-resistances.ndjson.gz",
            catalog.ItemResistances),
      ["item-sockets"] = WriteNdjson("normalized/item-sockets.ndjson.gz", catalog.ItemSockets),
      ["item-effects"] = WriteNdjson("normalized/item-effects.ndjson.gz", catalog.ItemEffects),
      ["item-sets"] = WriteNdjson("normalized/item-sets.ndjson.gz", catalog.ItemSets),
      ["item-set-members"] = WriteNdjson(
            "normalized/item-set-members.ndjson.gz",
            catalog.ItemSetMembers),
      ["item-set-effects"] = WriteNdjson(
            "normalized/item-set-effects.ndjson.gz",
            catalog.ItemSetEffects),
      ["game-classes"] = WriteNdjson("normalized/game-classes.ndjson.gz", catalog.GameClasses),
      ["game-races"] = WriteNdjson("normalized/game-races.ndjson.gz", catalog.GameRaces),
      ["item-classes"] = WriteNdjson("normalized/item-classes.ndjson.gz", catalog.ItemClasses),
      ["item-subclasses"] = WriteNdjson(
            "normalized/item-subclasses.ndjson.gz",
            catalog.ItemSubclasses),
      ["item-limit-categories"] = WriteNdjson(
            "normalized/item-limit-categories.ndjson.gz",
            catalog.ItemLimitCategories),
      ["gem-properties"] = WriteNdjson(
            "normalized/gem-properties.ndjson.gz",
            catalog.GemProperties),
      ["item-enchantments"] = WriteNdjson(
            "normalized/item-enchantments.ndjson.gz",
            catalog.ItemEnchantments),
      ["item-enchantment-effects"] = WriteNdjson(
            "normalized/item-enchantment-effects.ndjson.gz",
            catalog.ItemEnchantmentEffects),
      ["item-random-enchantments"] = WriteNdjson(
            "normalized/item-random-enchantments.ndjson.gz",
            catalog.ItemRandomEnchantments),
      ["item-bonus-trees"] = WriteNdjson(
            "normalized/item-bonus-trees.ndjson.gz",
            catalog.ItemBonusTrees),
      ["item-bonus-tree-nodes"] = WriteNdjson(
            "normalized/item-bonus-tree-nodes.ndjson.gz",
            catalog.ItemBonusTreeNodes),
      ["item-bonuses"] = WriteNdjson("normalized/item-bonuses.ndjson.gz", catalog.ItemBonuses),
      ["professions"] = WriteNdjson("normalized/professions.ndjson.gz", catalog.Professions),
      ["recipes"] = WriteNdjson("normalized/recipes.ndjson.gz", catalog.Recipes),
      ["recipe-inputs"] = WriteNdjson(
            "normalized/recipe-inputs.ndjson.gz",
            catalog.RecipeInputs),
      ["recipe-outputs"] = WriteNdjson(
            "normalized/recipe-outputs.ndjson.gz",
            catalog.RecipeOutputs),
      ["recipe-teaching-items"] = WriteNdjson(
            "normalized/recipe-teaching-items.ndjson.gz",
            catalog.RecipeTeachingItems),
      ["transformations"] = WriteNdjson(
            "normalized/transformations.ndjson.gz",
            catalog.Transformations),
      ["transformation-inputs"] = WriteNdjson(
            "normalized/transformation-inputs.ndjson.gz",
            catalog.TransformationInputs),
      ["transformation-outputs"] = WriteNdjson(
            "normalized/transformation-outputs.ndjson.gz",
            catalog.TransformationOutputs),
    };

    WriteJson("validation-report.json", validationReport);
    var manifest = new SnapshotManifest(
        "catalog-snapshot-manifest.v4",
        build.Product,
        build.ClientVersion,
        build.BuildNumber,
        build.BuildKey,
        build.CdnKey,
        options.Locale,
        DateTimeOffset.UtcNow,
        new HotfixManifest(hotfixStatus, hotfixHash),
        new DefinitionsManifest("wowdev/WoWDBDefs", options.DefinitionsRevision),
        new ExtractorManifest("wow-trader-extractor", "0.4.0", options.ExtractorRevision),
        rawArtifacts,
        normalizedArtifacts);
    WriteJson("manifest.json", manifest);
    WriteChecksums(rawArtifacts.Values.Concat(normalizedArtifacts.Values));
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
      foreach (var record in records)
      {
        writer.WriteLine(JsonSerializer.Serialize(record, CompactJson));
      }
    }

    return new ArtifactDescriptor(
        relativePath.Replace(Path.DirectorySeparatorChar, '/'),
        records.Count,
        Sha256File(outputPath));
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
        .Append("validation-report.json")
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
