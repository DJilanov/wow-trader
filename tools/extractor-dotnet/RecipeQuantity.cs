using System.Globalization;

namespace WowTrader.Extractor;

internal static class RecipeQuantity
{
  public static (int Minimum, int Maximum, int Numerator, int Denominator) Resolve(
      IReadOnlyDictionary<string, object?> effect)
  {
    int minimum;
    int maximum;
    if (effect.ContainsKey("EffectBasePointsF"))
    {
      var amount = Number(effect, "EffectBasePointsF");
      var variance = Math.Abs(Number(effect, "Variance"));
      if (!double.IsFinite(amount) || !double.IsFinite(variance) ||
          Number(effect, "Coefficient") != 0 || Number(effect, "EffectRealPointsPerLevel") != 0 ||
          Number(effect, "ResourceCoefficient") != 0)
        throw new InvalidDataException("A crafting output has unsupported scaled quantities");
      // Modern fields store the final amount, with variance spanning half its value in each direction.
      minimum = IntegerBoundary(amount * (1 - variance / 2));
      maximum = IntegerBoundary(amount * (1 + variance / 2));
    }
    else
    {
      var basePoints = Convert.ToInt32(Number(effect, "EffectBasePoints"));
      var dieSides = Convert.ToInt32(Number(effect, "EffectDieSides"));
      minimum = checked(basePoints + 1);
      maximum = checked(basePoints + Math.Max(1, dieSides));
    }
    minimum = Math.Max(1, minimum);
    maximum = Math.Max(minimum, maximum);
    var numerator = checked(minimum + maximum);
    return numerator % 2 == 0
        ? (minimum, maximum, numerator / 2, 1)
        : (minimum, maximum, numerator, 2);
  }

  private static int IntegerBoundary(double value)
  {
    var rounded = Math.Round(value);
    if (!double.IsFinite(value) || Math.Abs(value - rounded) > 0.0001 || rounded < 0 || rounded > 1_000_000)
      throw new InvalidDataException("A crafting output has unsupported fractional quantity bounds");
    return (int)rounded;
  }

  private static double Number(IReadOnlyDictionary<string, object?> row, string key) =>
      row.TryGetValue(key, out var value) && value is not null
          ? Convert.ToDouble(value, CultureInfo.InvariantCulture)
          : 0;
}
