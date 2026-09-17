using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using TACTSharp;
using War3Net.Drawing.Blp;

namespace WowTrader.Extractor;

internal sealed record ExtractedIcon(int FileDataId, int Width, int Height, string Sha256);
internal sealed record UnavailableIcon(int FileDataId, string Reason);

internal sealed record IconExtractionManifest(
    string SchemaVersion,
    string Product,
    string ClientVersion,
    int BuildNumber,
    DateTimeOffset ExtractedAt,
    IReadOnlyList<ExtractedIcon> Icons,
    IReadOnlyList<UnavailableIcon> UnavailableIcons);

internal sealed class IconExtractor
{
  private static readonly JsonSerializerOptions JsonOptions = new()
  {
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = true,
  };

  public IconExtractionManifest Extract(IconCliOptions options)
  {
    TACTSharp.Settings.LogLevel = TSLogLevel.Warn;
    var build = new BuildInstance();
    build.Settings.BaseDir = options.WowRoot;
    build.Settings.Product = options.Product;
    build.Settings.Region = options.Region;
    build.Settings.Locale = ParseLocale(options.Locale);
    build.Settings.CacheDir = Path.Combine(options.OutputDirectory, ".tact-cache");
    Directory.CreateDirectory(build.Settings.CacheDir);

    var buildInfo = new BuildInfo(Path.Combine(options.WowRoot, ".build.info"), build.Settings, build.cdn);
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

    var iconIds = File.ReadLines(options.IdsPath)
        .Where(line => !string.IsNullOrWhiteSpace(line))
        .Select(line => int.TryParse(line, out var value) && value > 0
            ? value
            : throw new InvalidDataException($"Invalid icon file data ID '{line}'"))
        .Distinct()
        .Order()
        .ToArray();
    if (iconIds.Length == 0) throw new InvalidDataException("No icon file data IDs were provided");

    var iconsDirectory = Path.Combine(options.OutputDirectory, "icons");
    Directory.CreateDirectory(iconsDirectory);
    var extracted = new List<ExtractedIcon>(iconIds.Length);
    var unavailable = new List<UnavailableIcon>();
    foreach (var fileDataId in iconIds)
    {
      var outputPath = Path.Combine(iconsDirectory, $"{fileDataId}.png");
      if (!File.Exists(outputPath))
      {
        var temporaryPath = $"{outputPath}.{Guid.NewGuid():N}.tmp";
        try
        {
          byte[] pixels;
          int decodedWidth;
          int decodedHeight;
          try
          {
            var source = build.OpenFileByFDID((uint)fileDataId);
            using var sourceStream = new MemoryStream(source, writable: false);
            using var blp = new BlpFile(sourceStream);
            pixels = blp.GetPixels(0, out decodedWidth, out decodedHeight, bgra: false);
          }
          catch (Exception exception) when (
              exception is ArgumentException or InvalidDataException or NotSupportedException)
          {
            unavailable.Add(new UnavailableIcon(fileDataId, exception.Message));
            Console.Error.WriteLine($"Skipping unavailable item icon {fileDataId}: {exception.Message}");
            continue;
          }
          PngWriter.WriteRgba(temporaryPath, decodedWidth, decodedHeight, pixels);
          File.Move(temporaryPath, outputPath);
        }
        finally
        {
          if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }
      }

      var (width, height) = ReadPngDimensions(outputPath);
      extracted.Add(new ExtractedIcon(
          fileDataId,
          width,
          height,
          Sha256File(outputPath)));
    }

    var versionParts = selected.Version.Split('.', StringSplitOptions.RemoveEmptyEntries);
    if (versionParts.Length < 4 || !int.TryParse(versionParts[^1], out var buildNumber))
    {
      throw new InvalidDataException($"Unexpected client version '{selected.Version}'");
    }
    var manifest = new IconExtractionManifest(
        "item-icon-manifest.v1",
        options.Product,
        selected.Version,
        buildNumber,
        DateTimeOffset.UtcNow,
        extracted,
        unavailable);
    WriteManifest(options.OutputDirectory, manifest);
    return manifest;
  }

  private static void WriteManifest(string outputDirectory, IconExtractionManifest manifest)
  {
    var path = Path.Combine(outputDirectory, "manifest.json");
    var temporaryPath = $"{path}.{Environment.ProcessId}.tmp";
    File.WriteAllText(
        temporaryPath,
        JsonSerializer.Serialize(manifest, JsonOptions) + "\n",
        new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
    File.Move(temporaryPath, path, overwrite: true);
  }

  private static string Sha256File(string path)
  {
    using var stream = File.OpenRead(path);
    return Convert.ToHexStringLower(SHA256.HashData(stream));
  }

  private static (int Width, int Height) ReadPngDimensions(string path)
  {
    Span<byte> header = stackalloc byte[24];
    using var stream = File.OpenRead(path);
    stream.ReadExactly(header);
    ReadOnlySpan<byte> signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!header[..8].SequenceEqual(signature) || !header[12..16].SequenceEqual("IHDR"u8))
    {
      throw new InvalidDataException($"Existing icon is not a valid PNG: {path}");
    }
    var width = BinaryPrimitives.ReadInt32BigEndian(header[16..20]);
    var height = BinaryPrimitives.ReadInt32BigEndian(header[20..24]);
    if (width <= 0 || height <= 0)
    {
      throw new InvalidDataException($"Existing icon has invalid dimensions: {path}");
    }
    return (width, height);
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
    _ => throw new UsageException($"Unsupported locale '{locale}'"),
  };
}
