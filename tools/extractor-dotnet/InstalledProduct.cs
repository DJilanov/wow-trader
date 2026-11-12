namespace WowTrader.Extractor;

internal static class InstalledProduct
{
  public static string Resolve(string wowRoot, string catalogProduct)
  {
    if (catalogProduct != "wow_classic_beta") return catalogProduct;
    var lines = File.ReadAllLines(Path.Combine(wowRoot, ".build.info"));
    if (lines.Length == 0) throw new InvalidDataException("The WoW build manifest is empty");
    var headers = lines[0].Split('|').Select(value => value.Split('!')[0]).ToArray();
    var productIndex = Array.IndexOf(headers, "Product");
    var activeIndex = Array.IndexOf(headers, "Active");
    if (productIndex < 0 || activeIndex < 0)
      throw new InvalidDataException("The WoW build manifest has an unsupported format");
    var launchRows = lines.Skip(1).Select(line => line.Split('|')).Count(row =>
        row.Length > Math.Max(productIndex, activeIndex) &&
        row[productIndex] == "wowf" && row[activeIndex] == "1");
    if (launchRows > 1) throw new InvalidDataException("Multiple active Forever launch builds were found");
    return launchRows == 1 ? "wowf" : catalogProduct;
  }
}
