using System.Globalization;

namespace WowTrader.Extractor;

internal sealed record CliOptions(
    string WowRoot,
    string Product,
    string Locale,
    string Region,
    string OutputDirectory,
    string DefinitionsDirectory,
    string DefinitionsRevision,
    string? ExtractorRevision)
{
  public static CliOptions Parse(string[] args)
  {
    if (args.Length == 0 || args[0] is "--help" or "-h")
    {
      throw new UsageException(null);
    }

    if (args[0] is not ("snapshot" or "world-snapshot"))
    {
      throw new UsageException($"Unknown command '{args[0]}'");
    }

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
            "--output",
            "--definitions",
            "--definitions-revision",
            "--extractor-revision",
        };
    var unknown = values.Keys.FirstOrDefault(key => !knownOptions.Contains(key));
    if (unknown is not null)
    {
      throw new UsageException($"Unknown option '{unknown}'");
    }

    var wowRoot = Require(values, "--wow-root");
    var definitions = Require(values, "--definitions");
    if (!File.Exists(Path.Combine(wowRoot, ".build.info")))
    {
      throw new DirectoryNotFoundException($"No .build.info exists under '{wowRoot}'");
    }

    if (!Directory.Exists(definitions))
    {
      throw new DirectoryNotFoundException($"Definitions directory '{definitions}' does not exist");
    }

    return new CliOptions(
        Path.GetFullPath(wowRoot),
        values.GetValueOrDefault("--product", "wow_anniversary"),
        values.GetValueOrDefault("--locale", "enUS"),
        values.GetValueOrDefault("--region", "eu").ToLower(CultureInfo.InvariantCulture),
        Path.GetFullPath(values.GetValueOrDefault("--output", "artifacts")),
        Path.GetFullPath(definitions),
        Require(values, "--definitions-revision"),
        values.GetValueOrDefault("--extractor-revision"));
  }

  public static string Usage =>
      """
        Usage:
          dotnet run --project tools/extractor-dotnet -- snapshot \
            --wow-root "/Applications/World of Warcraft" \
            --product wow_anniversary --locale enUS --region eu \
            --definitions <WoWDBDefs/definitions> \
            --definitions-revision <git-sha> --output ./artifacts

          dotnet run --project tools/extractor-dotnet -- world-snapshot \
            --wow-root "/Applications/World of Warcraft" \
            --product wow_classic_beta --locale enUS --region eu \
            --definitions <WoWDBDefs/definitions> \
            --definitions-revision <git-sha> --output ./artifacts
        """;

  private static string Require(IReadOnlyDictionary<string, string> values, string key)
  {
    var value = values.GetValueOrDefault(key);
    return string.IsNullOrWhiteSpace(value)
        ? throw new UsageException($"Missing required option '{key}'")
        : value;
  }
}

internal sealed class UsageException(string? message) : Exception(message);
