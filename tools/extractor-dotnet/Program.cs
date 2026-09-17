using System.Security.Cryptography;
using WowTrader.Extractor;

if (args.FirstOrDefault() == "icons")
{
  try
  {
    var iconOptions = IconCliOptions.Parse(args);
    var iconManifest = new IconExtractor().Extract(iconOptions);
    Console.WriteLine(
        $"Extracted {iconManifest.Icons.Count:N0} distinct item icons for " +
        $"{iconManifest.Product} build {iconManifest.BuildNumber}; " +
        $"{iconManifest.UnavailableIcons.Count:N0} source assets unavailable");
  }
  catch (UsageException exception)
  {
    if (!string.IsNullOrWhiteSpace(exception.Message)) Console.Error.WriteLine(exception.Message);
    Console.Error.WriteLine(IconCliOptions.Usage);
    Environment.ExitCode = 1;
  }
  catch (Exception exception)
  {
    Console.Error.WriteLine($"icon extractor: {exception.Message}");
    Console.Error.WriteLine(exception.StackTrace);
    Environment.ExitCode = 1;
  }
  return;
}

if (args.FirstOrDefault() == "world-snapshot")
{
  try
  {
    WorldSnapshotCommand.Run(CliOptions.Parse(args));
  }
  catch (UsageException exception)
  {
    if (!string.IsNullOrWhiteSpace(exception.Message)) Console.Error.WriteLine(exception.Message);
    Console.Error.WriteLine(CliOptions.Usage);
    Environment.ExitCode = 1;
  }
  catch (Exception exception)
  {
    Console.Error.WriteLine($"world extractor: {exception.Message}");
    Console.Error.WriteLine(exception.StackTrace);
    Environment.ExitCode = 1;
  }
  return;
}

var tableNames = new[]
{
    "Item",
    "ItemSparse",
    "ItemSearchName",
    "ItemSet",
    "ItemSetSpell",
    "ItemLimitCategory",
    "ItemRandomProperties",
    "ItemRandomSuffix",
    "ItemXBonusTree",
    "ItemBonusTreeNode",
    "ItemBonus",
    "GemProperties",
    "ItemClass",
    "ItemSubClass",
    "ChrClasses",
    "ChrRaces",
    "Spell",
    "SpellName",
    "SpellDuration",
    "SpellAuraOptions",
    "SpellDescriptionVariables",
    "SpellXDescriptionVariables",
    "SpellEquippedItems",
    "SpellItemEnchantment",
    "SpellItemEnchantmentCondition",
    "SkillLine",
    "SkillLineAbility",
    "SpellEffect",
    "SpellLearnSpell",
    "SpellReagents",
    "ItemEffect",
    "ItemDisenchantLoot",
    "SpellCooldowns",
    "SpellCategories",
    "SpellMisc",
    "SpellCastTimes",
};

try
{
  var options = CliOptions.Parse(args);
  Directory.CreateDirectory(options.OutputDirectory);
  var stagingDirectory = Path.Combine(
      options.OutputDirectory,
      $".snapshot-staging-{Guid.NewGuid():N}");
  Directory.CreateDirectory(stagingDirectory);

  try
  {
    var hotfixPath = FindHotfixPath(options);
    var hotfixHash = hotfixPath is null ? null : Sha256File(hotfixPath);
    var hotfixStatus = hotfixPath is null ? "missing" : "applied";
    Console.WriteLine(hotfixPath is null
        ? "No DBCache.bin found; the snapshot will be marked non-publishable"
        : $"Using hotfix cache {hotfixPath} ({hotfixHash})");

    var extractor = new CascTableExtractor(options);
    var (build, db2Directory) = extractor.Extract(tableNames, stagingDirectory);
    var reader = new Db2TableReader(
        db2Directory,
        options.DefinitionsDirectory,
        build.ClientVersion,
        hotfixPath);
    var tables = new SortedDictionary<string, Db2TableSnapshot>(StringComparer.Ordinal);
    foreach (var tableName in tableNames)
    {
      var table = reader.Read(tableName);
      tables.Add(tableName, table);
      Console.WriteLine(
          $"Parsed {tableName}: {table.BaseRows.Count:N0} base / {table.EffectiveRows.Count:N0} effective rows");
    }

    Directory.Delete(db2Directory, recursive: true);
    var catalog = new CatalogNormalizer(tables).Normalize();
    var requireTbcGoldenRecipe = string.Equals(
        options.Product,
        "wow_anniversary",
        StringComparison.Ordinal);
    var validation = CatalogValidator.Validate(
        build,
        hotfixStatus,
        tables,
        catalog,
        requireTbcGoldenRecipe);
    var writer = new ArtifactWriter(stagingDirectory);
    writer.Write(build, options, hotfixStatus, hotfixHash, tables, catalog, validation);

    var snapshotDirectory = Path.Combine(
        options.OutputDirectory,
        "catalog-snapshots",
        build.Product,
        build.BuildNumber.ToString(),
        options.Locale,
        hotfixHash ?? "missing-hotfix",
        "catalog-snapshot-manifest.v4");
    if (Directory.Exists(snapshotDirectory))
    {
      throw new IOException($"Snapshot directory already exists: {snapshotDirectory}");
    }
    Directory.CreateDirectory(Path.GetDirectoryName(snapshotDirectory)!);
    Directory.Move(stagingDirectory, snapshotDirectory);

    Console.WriteLine($"Snapshot: {snapshotDirectory}");
    Console.WriteLine(
        $"Catalog: {catalog.Items.Count:N0} items, {catalog.ItemStats.Count:N0} item stats, " +
        $"{catalog.ItemEffects.Count:N0} item effects, {catalog.Recipes.Count:N0} recipes, " +
        $"{catalog.RecipeTeachingItems.Count:N0} teaching-item links, " +
        $"{catalog.Transformations.Count:N0} item transformations");
    Console.WriteLine(validation.Valid ? "Validation: passed" : "Validation: failed");
    if (!validation.Valid) Environment.ExitCode = 2;
  }
  catch
  {
    if (Directory.Exists(stagingDirectory)) Directory.Delete(stagingDirectory, recursive: true);
    throw;
  }
}
catch (UsageException exception)
{
  if (!string.IsNullOrWhiteSpace(exception.Message)) Console.Error.WriteLine(exception.Message);
  Console.Error.WriteLine(CliOptions.Usage);
  Environment.ExitCode = 1;
}
catch (Exception exception)
{
  Console.Error.WriteLine($"extractor: {exception.Message}");
  Console.Error.WriteLine(exception.StackTrace);
  Environment.ExitCode = 1;
}

static string? FindHotfixPath(CliOptions options)
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

static string Sha256File(string path)
{
  using var stream = File.OpenRead(path);
  return Convert.ToHexStringLower(SHA256.HashData(stream));
}
