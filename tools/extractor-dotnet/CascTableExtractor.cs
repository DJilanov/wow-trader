using TACTSharp;

namespace WowTrader.Extractor;

internal sealed class CascTableExtractor
{
  private readonly CliOptions options;

  public CascTableExtractor(CliOptions options)
  {
    this.options = options;
  }

  public (BuildMetadata Metadata, string Db2Directory) Extract(
      IReadOnlyList<string> tableNames,
      string stagingDirectory)
  {
    TACTSharp.Settings.LogLevel = TSLogLevel.Warn;
    var build = new BuildInstance();
    build.Settings.BaseDir = options.WowRoot;
    build.Settings.Product = options.Product;
    build.Settings.Region = options.Region;
    build.Settings.Locale = ParseLocale(options.Locale);
    build.Settings.CacheDir = Path.Combine(options.OutputDirectory, ".tact-cache");
    Directory.CreateDirectory(build.Settings.CacheDir);

    var buildInfo = new BuildInfo(
        Path.Combine(options.WowRoot, ".build.info"),
        build.Settings,
        build.cdn);
    var matchingBuilds = buildInfo.Entries
        .Where(entry => string.Equals(entry.Product, options.Product, StringComparison.Ordinal))
        .ToArray();
    if (matchingBuilds.Length != 1)
    {
      throw new InvalidOperationException(
          $"Expected one active build for product '{options.Product}', found {matchingBuilds.Length}");
    }

    var selected = matchingBuilds[0];
    build.LoadConfigs(selected.BuildConfig, selected.CDNConfig);
    build.Load();

    var db2Directory = Path.Combine(stagingDirectory, "db2");
    Directory.CreateDirectory(db2Directory);
    using var hasher = new Jenkins96();
    Listfile? listfile = null;
    foreach (var tableName in tableNames)
    {
      var gamePath = $"DBFilesClient/{tableName}.db2";
      var entries = build.Root!.GetEntriesByLookup(hasher.ComputeHash(gamePath, true));
      byte[] bytes;
      if (entries.Count > 0)
      {
        bytes = build.OpenFileByCKey(entries[0].md5.AsSpan());
      }
      else
      {
        listfile ??= LoadListfile(build);
        var fileDataId = listfile.GetFDID(gamePath);
        if (fileDataId == 0)
        {
          throw new FileNotFoundException($"Table '{gamePath}' is not present in the root or listfile");
        }
        bytes = build.OpenFileByFDID(fileDataId);
      }

      File.WriteAllBytes(Path.Combine(db2Directory, $"{tableName}.db2"), bytes);
      Console.WriteLine($"Extracted {tableName} ({bytes.Length:N0} bytes)");
    }

    return (ParseMetadata(selected), db2Directory);
  }

  private Listfile LoadListfile(BuildInstance build)
  {
    var listfile = new Listfile();
    var path = Path.Combine(build.Settings.CacheDir, "listfile.csv");
    listfile.Initialize(build.cdn, build.Settings, path, File.Exists(path));
    return listfile;
  }

  private BuildMetadata ParseMetadata(BuildInfo.AvailableBuild selected)
  {
    var versionParts = selected.Version.Split('.', StringSplitOptions.RemoveEmptyEntries);
    if (versionParts.Length < 4 || !int.TryParse(versionParts[^1], out var buildNumber))
    {
      throw new InvalidDataException($"Unexpected client version '{selected.Version}'");
    }

    return new BuildMetadata(
        options.Product,
        selected.Version,
        buildNumber,
        selected.BuildConfig.ToLowerInvariant(),
        selected.CDNConfig.ToLowerInvariant());
  }

  private static RootInstance.LocaleFlags ParseLocale(string locale) => locale.ToLowerInvariant() switch
  {
    "enus" => RootInstance.LocaleFlags.enUS,
    "engb" => RootInstance.LocaleFlags.enGB,
    "dede" => RootInstance.LocaleFlags.deDE,
    "eses" => RootInstance.LocaleFlags.esES,
    "esmx" => RootInstance.LocaleFlags.esMX,
    "frfr" => RootInstance.LocaleFlags.frFR,
    "itit" => RootInstance.LocaleFlags.itIT,
    "kokr" => RootInstance.LocaleFlags.koKR,
    "ptbr" => RootInstance.LocaleFlags.ptBR,
    "ruru" => RootInstance.LocaleFlags.ruRU,
    "zhcn" => RootInstance.LocaleFlags.zhCN,
    "zhtw" => RootInstance.LocaleFlags.zhTW,
    _ => throw new ArgumentOutOfRangeException(nameof(locale), locale, "Unsupported locale"),
  };
}
