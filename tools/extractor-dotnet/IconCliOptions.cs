using System.Globalization;

namespace WowTrader.Extractor;

internal sealed record IconCliOptions(
    string WowRoot,
    string Product,
    string Locale,
    string Region,
    string IdsPath,
    string OutputDirectory)
{
  public static IconCliOptions Parse(string[] args)
  {
    var values = new Dictionary<string, string>(StringComparer.Ordinal);
    for (var index = 1; index < args.Length; index += 2)
    {
      var option = args[index];
      if (!option.StartsWith("--", StringComparison.Ordinal) || index + 1 >= args.Length)
      {
        throw new UsageException($"Option '{option}' requires a value");
      }
      if (!values.TryAdd(option, args[index + 1]))
      {
        throw new UsageException($"Option '{option}' was provided more than once");
      }
    }

    var knownOptions = new HashSet<string>(StringComparer.Ordinal)
    {
        "--wow-root",
        "--product",
        "--locale",
        "--region",
        "--ids",
        "--output",
    };
    var unknown = values.Keys.FirstOrDefault(key => !knownOptions.Contains(key));
    if (unknown is not null) throw new UsageException($"Unknown option '{unknown}'");

    var wowRoot = Require(values, "--wow-root");
    var idsPath = Require(values, "--ids");
    if (!File.Exists(Path.Combine(wowRoot, ".build.info")))
    {
      throw new DirectoryNotFoundException($"No .build.info exists under '{wowRoot}'");
    }
    if (!File.Exists(idsPath)) throw new FileNotFoundException("Icon ID file does not exist", idsPath);

    return new IconCliOptions(
        Path.GetFullPath(wowRoot),
        values.GetValueOrDefault("--product", "wow_anniversary"),
        values.GetValueOrDefault("--locale", "enUS"),
        values.GetValueOrDefault("--region", "eu").ToLower(CultureInfo.InvariantCulture),
        Path.GetFullPath(idsPath),
        Path.GetFullPath(Require(values, "--output")));
  }

  public static string Usage =>
      """
        Usage:
          dotnet run --project tools/extractor-dotnet -- icons \
            --wow-root "/Applications/World of Warcraft" \
            --product wow_anniversary --locale enUS --region eu \
            --ids /path/to/icon-file-data-ids.txt --output /path/to/icons
        """;

  private static string Require(IReadOnlyDictionary<string, string> values, string key)
  {
    var value = values.GetValueOrDefault(key);
    return string.IsNullOrWhiteSpace(value)
        ? throw new UsageException($"Missing required option '{key}'")
        : value;
  }
}
