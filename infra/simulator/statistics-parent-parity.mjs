import assert from "node:assert/strict";

function finite(value, path) {
  if (typeof value === "number")
    assert(Number.isFinite(value), "Nonfinite current metric: " + path);
  else if (Array.isArray(value))
    value.forEach((entry, index) => finite(entry, path + "[" + index + "]"));
  else if (value && typeof value === "object")
    for (const [key, entry] of Object.entries(value)) finite(entry, path + "." + key);
}

function normalize(api, value, current) {
  const message = api.RaidSimResult.fromJson(
    { raidMetrics: { parties: [{ players: [value] }] } },
    { ignoreUnknownFields: false },
  );
  if (current) finite(message, "result");
  return api.RaidSimResult.toJson(message).raidMetrics.parties[0].players[0];
}

function summary(previous, current, path) {
  const aura = ["uptimeSecondsAvg", "uptimeSecondsStdev"].some(
      (key) => Object.hasOwn(previous, key) || Object.hasOwn(current, key),
    ),
    distribution = ["avg", "stdev"].some(
      (key) => Object.hasOwn(previous, key) || Object.hasOwn(current, key),
    );
  if (!aura && !distribution) return undefined;
  assert(!(aura && distribution), "Mixed statistics summary: " + path);
  const meanKey = aura ? "uptimeSecondsAvg" : "avg",
    deviationKey = aura ? "uptimeSecondsStdev" : "stdev",
    oldData = previous.aggregatorData,
    newData = current.aggregatorData;
  assert(oldData && newData, "Missing raw statistics moments: " + path);
  const count = oldData.n ?? 0,
    sumSq = oldData.sumSq ?? 0;
  assert(
    Number.isSafeInteger(count) && count > 0,
    "Empty statistics are not measured zeros: " + path,
  );
  assert.equal(newData.n ?? 0, count, "Statistics sample count changed: " + path);
  assert.equal(newData.sumSq ?? 0, sumSq, "Raw statistics moments changed: " + path);
  assert(Number.isFinite(sumSq) && sumSq >= 0, path);
  const oldMean = previous[meanKey] ?? 0,
    newMean = current[meanKey] ?? 0,
    oldDeviation = previous[deviationKey] === "NaN" ? NaN : (previous[deviationKey] ?? 0),
    newDeviation = current[deviationKey] ?? 0;
  assert(
    Number.isFinite(oldMean) && Number.isFinite(newMean),
    "Undefined statistics mean: " + path,
  );
  assert(
    Number.isFinite(newDeviation) && newDeviation >= 0,
    "Invalid corrected deviation: " + path,
  );
  const meanBound = 8 * count * Number.EPSILON * Math.max(1, Math.abs(oldMean), Math.abs(newMean));
  assert(
    Math.abs(oldMean - newMean) <= meanBound,
    "Statistics mean changed beyond roundoff: " + path,
  );
  const secondMoment = sumSq / count,
    legacyVariance = secondMoment - oldMean * oldMean,
    correctedVariance = newDeviation * newDeviation,
    varianceBound =
      16 *
      count *
      Number.EPSILON *
      Math.max(1, Math.abs(secondMoment), oldMean * oldMean, newMean * newMean);
  assert(Number.isFinite(correctedVariance), path);
  assert(
    Math.abs(correctedVariance - legacyVariance) <= varianceBound,
    "Corrected variance disagrees with raw moments: " + path,
  );
  if (Number.isNaN(oldDeviation))
    assert(
      legacyVariance < 0 && legacyVariance >= -varianceBound,
      "Unexplained historical NaN: " + path,
    );
  else {
    assert(
      Number.isFinite(oldDeviation) && oldDeviation >= 0,
      "Unsupported historical deviation: " + path,
    );
    assert(
      legacyVariance >= 0,
      "Historical finite deviation contradicts its source formula: " + path,
    );
    assert(
      Math.abs(oldDeviation * oldDeviation - legacyVariance) <= varianceBound,
      "Historical deviation disagrees with raw moments: " + path,
    );
  }
  return {
    keys: [meanKey, deviationKey],
    review: {
      path,
      count,
      sumSq,
      oldMean,
      newMean,
      oldDeviation: Number.isNaN(oldDeviation) ? "NaN" : oldDeviation,
      newDeviation,
      legacyVariance,
      correctedVariance,
      varianceBound,
      changed: oldMean !== newMean || oldDeviation !== newDeviation,
    },
  };
}

function identity(row, collection) {
  return JSON.stringify([
    Object.entries(row.id ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    collection === "resources" ? (row.type ?? 0) : null,
  ]);
}

function compareRows(previous, current, path, collection) {
  assert.equal(previous.length, current.length, "Parent metric multiplicity changed: " + path);
  const edges = previous.map((row) =>
    current.flatMap((candidate, index) => {
      if (identity(row, collection) !== identity(candidate, collection)) return [];
      try {
        return [
          { index, reviews: compare(row, candidate, path + "[" + identity(row, collection) + "]") },
        ];
      } catch (error) {
        if (!(error instanceof assert.AssertionError)) throw error;
        return [];
      }
    }),
  );
  const matched = new Map();
  function assign(index, visited) {
    for (const edge of edges[index]) {
      if (visited.has(edge.index)) continue;
      visited.add(edge.index);
      if (!matched.has(edge.index) || assign(matched.get(edge.index), visited)) {
        matched.set(edge.index, index);
        return true;
      }
    }
    return false;
  }
  for (let index = 0; index < previous.length; index++)
    assert(assign(index, new Set()), "Complete parent metric rows differ: " + path);
  return [...matched].flatMap(
    ([target, origin]) => edges[origin].find((edge) => edge.index === target).reviews,
  );
}

function compare(previous, current, path, collection = "") {
  if (typeof previous === "number" || typeof current === "number") {
    assert(
      typeof previous === "number" &&
        typeof current === "number" &&
        Number.isFinite(previous) &&
        Number.isFinite(current),
      "Unreviewed nonfinite parent metric: " + path,
    );
    if (Number.isSafeInteger(previous) && Number.isSafeInteger(current))
      assert.equal(previous, current, path);
    else
      assert(
        Math.abs(previous - current) <=
          1e-8 + 1e-12 * Math.max(Math.abs(previous), Math.abs(current)),
        "Parent metric changed: " + path,
      );
    return [];
  }
  if (Array.isArray(previous) || Array.isArray(current)) {
    assert(Array.isArray(previous) && Array.isArray(current), path);
    if (["actions", "auras", "resources"].includes(collection))
      return compareRows(previous, current, path, collection);
    assert.equal(previous.length, current.length, path);
    return previous.flatMap((row, index) => compare(row, current[index], path + "[" + index + "]"));
  }
  if ((previous && typeof previous === "object") || (current && typeof current === "object")) {
    assert(
      previous && current && typeof previous === "object" && typeof current === "object",
      path,
    );
    const statistics =
        previous.aggregatorData || current.aggregatorData
          ? summary(previous, current, path)
          : undefined,
      excluded = new Set(statistics?.keys ?? []),
      oldKeys = Object.keys(previous)
        .filter((key) => !excluded.has(key))
        .sort(),
      newKeys = Object.keys(current)
        .filter((key) => !excluded.has(key))
        .sort();
    assert.deepEqual(oldKeys, newKeys, path);
    return [
      ...(statistics ? [statistics.review] : []),
      ...oldKeys.flatMap((key) => compare(previous[key], current[key], path + "." + key, key)),
    ];
  }
  assert.equal(previous, current, path);
  return [];
}

/** Compare gameplay fields across a statistics-only engine change.
 * Every corrected metric must be finite. Historical undefined deviations are
 * accepted only as diagnostic parent data with matching raw moments; they are
 * never admitted as current results or compared through a projected value.
 * @param {object} api
 * @param {object} previous
 * @param {object} current
 * @returns {object}
 */
export function reviewStatisticsOnlyParentParity(api, previous, current) {
  const currentUnit = normalize(api, current, true),
    previousUnit = normalize(api, previous, false),
    summaries = compare(previousUnit, currentUnit, "unit");
  return {
    schema: "kfc-statistics-only-parent-parity.v1",
    gameplayMetricsMatch: true,
    currentMetricsFinite: true,
    historicalMetricsAdmitted: false,
    statisticsCompared: summaries.length,
    statisticsChanged: summaries.filter((entry) => entry.changed).length,
    historicalUndefinedStatistics: summaries.filter((entry) => entry.oldDeviation === "NaN").length,
    summaries,
  };
}
