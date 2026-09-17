using System.Buffers.Binary;
using System.Security.Cryptography;
using TACTSharp;
using War3Net.Drawing.Blp;

namespace WowTrader.Extractor;

internal sealed record MapMediaTile(
    int FileDataId,
    string Path,
    int Width,
    int Height,
    string Sha256);

internal sealed record UnavailableMapMediaTile(int FileDataId, string Reason);

internal sealed record MapMediaManifest(
    string SchemaVersion,
    string Product,
    string ClientVersion,
    int BuildNumber,
    DateTimeOffset ExtractedAt,
    IReadOnlyList<MapMediaTile> Tiles,
    IReadOnlyList<UnavailableMapMediaTile> UnavailableTiles);

internal sealed class MapMediaExtractor
{
  public MapMediaManifest Extract(
      CliOptions options,
      BuildMetadata metadata,
      IReadOnlyList<WorldMapArtTile> mapArtTiles,
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
    var selected = buildInfo.Entries.Single(
        entry => string.Equals(entry.Product, options.Product, StringComparison.Ordinal));
    build.LoadConfigs(selected.BuildConfig, selected.CDNConfig);
    build.Load();

    var mediaDirectory = Path.Combine(stagingDirectory, "media", "map-art");
    Directory.CreateDirectory(mediaDirectory);
    var extracted = new List<MapMediaTile>();
    var unavailable = new List<UnavailableMapMediaTile>();
    foreach (var fileDataId in mapArtTiles.Select(tile => tile.FileDataId).Distinct().Order())
    {
      var relativePath = $"media/map-art/{fileDataId}.png";
      var outputPath = Path.Combine(stagingDirectory, relativePath);
      try
      {
        var source = build.OpenFileByFDID((uint)fileDataId);
        using var sourceStream = new MemoryStream(source, writable: false);
        using var blp = new BlpFile(sourceStream);
        var pixels = blp.GetPixels(0, out var width, out var height, bgra: false);
        PngWriter.WriteRgba(outputPath, width, height, pixels);
        extracted.Add(new MapMediaTile(
            fileDataId,
            relativePath,
            width,
            height,
            Sha256File(outputPath)));
      }
      catch (Exception exception)
      {
        unavailable.Add(new UnavailableMapMediaTile(
            fileDataId,
            $"{exception.GetType().Name}: {exception.Message}"));
        Console.Error.WriteLine($"Map tile {fileDataId} is unavailable: {exception.Message}");
      }
    }

    return new MapMediaManifest(
        "map-media-manifest.v1",
        metadata.Product,
        metadata.ClientVersion,
        metadata.BuildNumber,
        DateTimeOffset.UtcNow,
        extracted,
        unavailable);
  }

  public static (int Width, int Height) ReadPngDimensions(string path)
  {
    Span<byte> header = stackalloc byte[24];
    using var stream = File.OpenRead(path);
    stream.ReadExactly(header);
    ReadOnlySpan<byte> signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!header[..8].SequenceEqual(signature) || !header[12..16].SequenceEqual("IHDR"u8))
    {
      throw new InvalidDataException($"Map tile is not a valid PNG: {path}");
    }
    return (
        BinaryPrimitives.ReadInt32BigEndian(header[16..20]),
        BinaryPrimitives.ReadInt32BigEndian(header[20..24]));
  }

  private static string Sha256File(string path)
  {
    using var stream = File.OpenRead(path);
    return Convert.ToHexStringLower(SHA256.HashData(stream));
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
