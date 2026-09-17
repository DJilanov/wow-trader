using System.Collections;
using System.Globalization;
using DBCD;
using DBCD.IO;
using DBCD.Providers;

namespace WowTrader.Extractor;

internal sealed class Db2TableReader
{
  private const ulong MaximumSafeJsonInteger = 9_007_199_254_740_991;

  private readonly DBCD.DBCD dbcd;
  private readonly string buildVersion;
  private readonly string? hotfixPath;

  public Db2TableReader(
      string db2Directory,
      string definitionsDirectory,
      string buildVersion,
      string? hotfixPath)
  {
    dbcd = new DBCD.DBCD(
        new FilesystemDBCProvider(db2Directory),
        new FilesystemDBDProvider(definitionsDirectory));
    this.buildVersion = buildVersion;
    this.hotfixPath = hotfixPath;
  }

  public Db2TableSnapshot Read(string tableName)
  {
    var storage = dbcd.Load(tableName, buildVersion, Locale.EnUS);
    var encryptedSections = storage.GetEncryptedSections().Count;
    var encryptedRecords = storage.GetEncryptedIDs().Values.Sum(ids => ids.Length);
    var baseRows = ConvertRows(storage);

    if (hotfixPath is not null)
    {
      using var stream = File.Open(hotfixPath, FileMode.Open, FileAccess.Read, FileShare.Read);
      storage.ApplyingHotfixes(new HotfixReader(stream));
    }

    return new Db2TableSnapshot(
        tableName,
        baseRows,
        ConvertRows(storage),
        encryptedSections,
        encryptedRecords);
  }

  private static IReadOnlyList<IReadOnlyDictionary<string, object?>> ConvertRows(
      IDBCDStorage storage)
  {
    var rows = new List<IReadOnlyDictionary<string, object?>>(storage.Count);
    foreach (var id in storage.Keys.Order())
    {
      var source = storage[id];
      var row = new Dictionary<string, object?>(StringComparer.Ordinal)
      {
        ["id"] = id,
      };
      foreach (var column in storage.AvailableColumns.Where(column => column != "ID"))
      {
        row[column] = ConvertValue(source[column]);
      }
      rows.Add(row);
    }
    return rows;
  }

  private static object? ConvertValue(object? value)
  {
    if (value is null) return null;
    if (value is Enum enumValue)
    {
      return Convert.ChangeType(
          enumValue,
          Enum.GetUnderlyingType(enumValue.GetType()),
          CultureInfo.InvariantCulture);
    }
    if (value is ulong unsignedLong)
    {
      return unsignedLong <= MaximumSafeJsonInteger
          ? unsignedLong
          : unsignedLong.ToString(CultureInfo.InvariantCulture);
    }
    if (value is Array array)
    {
      return array.Cast<object?>().Select(ConvertValue).ToArray();
    }
    if (value is float floatValue && !float.IsFinite(floatValue)) return null;
    if (value is double doubleValue && !double.IsFinite(doubleValue)) return null;
    if (value is IEnumerable enumerable and not string)
    {
      return enumerable.Cast<object?>().Select(ConvertValue).ToArray();
    }
    return value;
  }
}
