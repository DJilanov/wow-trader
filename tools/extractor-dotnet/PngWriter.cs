using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;

namespace WowTrader.Extractor;

internal static class PngWriter
{
  private static readonly byte[] Signature = [137, 80, 78, 71, 13, 10, 26, 10];

  public static void WriteRgba(string path, int width, int height, ReadOnlySpan<byte> rgba)
  {
    if (width <= 0 || height <= 0) throw new ArgumentOutOfRangeException(nameof(width));
    if (rgba.Length != checked(width * height * 4))
    {
      throw new InvalidDataException("RGBA pixel count does not match the image dimensions");
    }

    using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
    output.Write(Signature);

    Span<byte> header = stackalloc byte[13];
    BinaryPrimitives.WriteInt32BigEndian(header, width);
    BinaryPrimitives.WriteInt32BigEndian(header[4..], height);
    header[8] = 8;
    header[9] = 6;
    WriteChunk(output, "IHDR", header);

    using var compressed = new MemoryStream();
    using (var zlib = new ZLibStream(compressed, CompressionLevel.SmallestSize, leaveOpen: true))
    {
      var rowLength = checked(width * 4);
      for (var row = 0; row < height; row++)
      {
        zlib.WriteByte(0);
        zlib.Write(rgba.Slice(row * rowLength, rowLength));
      }
    }
    WriteChunk(output, "IDAT", compressed.ToArray());
    WriteChunk(output, "IEND", []);
  }

  private static void WriteChunk(Stream output, string type, ReadOnlySpan<byte> data)
  {
    Span<byte> length = stackalloc byte[4];
    BinaryPrimitives.WriteInt32BigEndian(length, data.Length);
    output.Write(length);

    var typeBytes = Encoding.ASCII.GetBytes(type);
    output.Write(typeBytes);
    output.Write(data);

    var crc = Crc32(typeBytes, data);
    Span<byte> checksum = stackalloc byte[4];
    BinaryPrimitives.WriteUInt32BigEndian(checksum, crc);
    output.Write(checksum);
  }

  private static uint Crc32(ReadOnlySpan<byte> type, ReadOnlySpan<byte> data)
  {
    var crc = uint.MaxValue;
    foreach (var value in type) crc = UpdateCrc(crc, value);
    foreach (var value in data) crc = UpdateCrc(crc, value);
    return ~crc;
  }

  private static uint UpdateCrc(uint crc, byte value)
  {
    crc ^= value;
    for (var bit = 0; bit < 8; bit++)
    {
      crc = (crc & 1) == 1 ? 0xedb88320U ^ (crc >> 1) : crc >> 1;
    }
    return crc;
  }
}
