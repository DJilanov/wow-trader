import Link from "next/link";

import type { ItemDetail } from "../lib/data";
import {
  bindingText,
  calculateWeaponDps,
  cleanClientText,
  damageTypeName,
  formatEnchantment,
  formatItemEffect,
  formatStat,
  formatWeaponSpeed,
  inventoryTypeName,
  resistanceName,
  reputationStandingName,
  socketName,
  type ItemTooltipRecord,
} from "../lib/item-tooltip";
import { ItemIcon } from "./item-icon";

interface ItemTooltipProps {
  readonly item: ItemDetail;
  readonly viewerClassId: number | null;
  readonly viewerLevel: number | null;
}

interface ItemTooltipContentProps {
  readonly item: ItemTooltipRecord;
  readonly viewerClassId: number | null;
  readonly viewerLevel: number | null;
  readonly linkSetMembers: boolean;
  readonly usePageHeading: boolean;
}

export function ItemTooltip({
  item,
  viewerClassId,
  viewerLevel,
}: ItemTooltipProps): React.JSX.Element {
  const unresolvedEffects = [...item.effects, ...(item.itemSet?.effects ?? [])].filter(
    (effect) => !formatItemEffect(effect).exact,
  ).length;

  return (
    <div className="item-inspection">
      <ItemIcon fileDataId={item.iconFileDataId} quality={item.quality} size="large" />
      <ItemTooltipContent
        item={item}
        viewerClassId={viewerClassId}
        viewerLevel={viewerLevel}
        linkSetMembers
        usePageHeading
      />
      <p className="tooltip-evidence-note">
        Preview uses client DB2 facts from build {item.build.number}. Derived DPS is marked by its
        decimal display.{" "}
        {unresolvedEffects === 0
          ? "All shown effects resolved."
          : `${unresolvedEffects} effect ${unresolvedEffects === 1 ? "label uses" : "labels use"} the client spell name because its formula contains unresolved runtime tokens.`}
      </p>
    </div>
  );
}

export function ItemTooltipContent({
  item,
  viewerClassId,
  viewerLevel,
  linkSetMembers,
  usePageHeading,
}: ItemTooltipContentProps): React.JSX.Element {
  const binding = bindingText(item.binding);
  const armor = item.resistances.find((resistance) => resistance.school === 0);
  const resistances = item.resistances.filter((resistance) => resistance.school !== 0);
  const selectedClass = item.allowedClasses.find(
    (gameClass) => gameClass.classId === viewerClassId,
  );
  const classRestricted =
    viewerClassId !== null && item.allowableClassMask !== -1 && selectedClass === undefined;
  const levelRestricted =
    viewerLevel !== null && item.requiredLevel > 0 && viewerLevel < item.requiredLevel;

  return (
    <section className="wow-tooltip" aria-label={`${item.name} in-game item preview`}>
      {usePageHeading ? (
        <h1 className={`wow-tooltip-name quality-text-${item.quality}`}>{item.name}</h1>
      ) : (
        <p className={`wow-tooltip-name quality-text-${item.quality}`}>{item.name}</p>
      )}
      {item.itemLevel > 0 ? <p className="wow-tooltip-muted">Item Level {item.itemLevel}</p> : null}
      {item.maxCount === 1 ? <p>Unique</p> : null}
      {item.maxCount > 1 ? <p>Unique ({item.maxCount})</p> : null}
      {item.limitCategory ? (
        <p>
          Unique-Equipped: {item.limitCategory.name} ({item.limitCategory.quantity})
        </p>
      ) : null}
      {binding ? <p>{binding}</p> : null}

      {item.inventoryType > 0 ? (
        <p className="wow-tooltip-split">
          <span>{inventoryTypeName(item.inventoryType)}</span>
          <span>{item.subclassName ?? item.className ?? ""}</span>
        </p>
      ) : null}

      {item.damages.map((damage) => {
        const dps = calculateWeaponDps(damage.minimum, damage.maximum, item.delayMs);
        return (
          <div key={damage.slot}>
            <p className="wow-tooltip-split">
              <span>
                {damage.minimum} - {damage.maximum} {damageTypeName(damage.damageType)}
              </span>
              {item.delayMs > 0 ? <span>Speed {formatWeaponSpeed(item.delayMs)}</span> : null}
            </p>
            {dps !== null ? <p>({dps.toFixed(1)} damage per second)</p> : null}
          </div>
        );
      })}

      {armor ? <p>{armor.value} Armor</p> : null}
      {item.stats.map((stat) => (
        <p key={stat.slot}>{formatStat(stat.statType, stat.value)}</p>
      ))}
      {resistances.map((resistance) => (
        <p key={resistance.school}>
          {resistance.value > 0 ? "+" : ""}
          {resistance.value} {resistanceName(resistance.school)}
        </p>
      ))}

      {item.sockets.map((socket) => (
        <p className="wow-tooltip-socket" key={socket.slot}>
          <span className={`socket-gem socket-gem-${socket.socketType}`} aria-hidden="true" />
          {socketName(socket.socketType)}
        </p>
      ))}
      {item.socketBonus ? (
        <p className="wow-tooltip-socket-bonus">
          Socket Bonus: {formatEnchantment(item.socketBonus)}
        </p>
      ) : null}
      {item.gem ? (
        <p className="wow-tooltip-effect">{formatEnchantment(item.gem.enchantment)}</p>
      ) : null}

      {item.maxDurability > 0 ? (
        <p>
          Durability {item.maxDurability} / {item.maxDurability}
        </p>
      ) : null}
      {item.allowedClasses.length > 0 && item.allowableClassMask !== -1 ? (
        <p className={classRestricted ? "wow-tooltip-requirement-invalid" : undefined}>
          Classes: {item.allowedClasses.map((gameClass) => gameClass.name).join(", ")}
        </p>
      ) : null}
      {item.allowedRaces.length > 0 && !item.allowableRaceMask.every((word) => word === -1) ? (
        <p>Races: {item.allowedRaces.map((race) => race.name).join(", ")}</p>
      ) : null}
      {item.requiredLevel > 0 ? (
        <p className={levelRestricted ? "wow-tooltip-requirement-invalid" : undefined}>
          Requires Level {item.requiredLevel}
        </p>
      ) : null}
      {item.requiredSkillId !== null ? (
        <p>
          Requires skill {item.requiredSkillId}
          {item.requiredSkillRank > 0 ? ` (${item.requiredSkillRank})` : ""}
        </p>
      ) : null}
      {item.requiredAbilityId !== null ? (
        <p>Requires {item.requiredAbilityName ?? `ability ${item.requiredAbilityId}`}</p>
      ) : null}
      {item.minimumFactionId !== null ? (
        <p>
          Requires {reputationStandingName(item.minimumReputation)} with faction{" "}
          {item.minimumFactionId}
        </p>
      ) : null}

      {item.effects.map((effect, index) => {
        const formatted = formatItemEffect(effect);
        return (
          <p
            className="wow-tooltip-effect"
            key={`${effect.spellId}-${effect.triggerType}-${index}`}
          >
            <span>{formatted.prefix}</span> {formatted.text}
          </p>
        );
      })}

      {item.itemSet ? (
        <div className="wow-tooltip-set">
          <p className="wow-tooltip-set-name">
            {item.itemSet.name} (0/{item.itemSet.members.length})
          </p>
          <ul className="wow-tooltip-set-members">
            {item.itemSet.members.map((member) => (
              <li key={member.itemId}>
                {linkSetMembers ? (
                  <Link href={`/tbc/encyclopedia/items/${member.itemId}`}>{member.name}</Link>
                ) : (
                  member.name
                )}
              </li>
            ))}
          </ul>
          <div className="wow-tooltip-set-effects">
            {item.itemSet.effects.map((effect) => (
              <p key={`${effect.threshold}-${effect.spellId}`}>
                ({effect.threshold}) Set: {formatItemEffect(effect).text}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {item.description ? (
        <p className="wow-tooltip-flavor">&quot;{cleanClientText(item.description)}&quot;</p>
      ) : null}
    </section>
  );
}
