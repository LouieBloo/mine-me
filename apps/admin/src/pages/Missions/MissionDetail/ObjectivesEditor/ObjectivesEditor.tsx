import React from 'react';
import { AVAILABLE_OBJECTIVE_TYPES, MAX_MISSION_OBJECTIVES, OBJECTIVE_TYPES, isObjectiveType, type ObjectiveDefinition, type ObjectiveTargetKind } from '@mine-me/shared';
import { newObjective } from '../../missionForm';
import { buttonClass, dangerButtonClass, hintClass, inputClass, labelClass, panelClass, readNumber, show } from '../../../Doodads/DoodadDetail/panelStyles';
import './ObjectivesEditor.css';

/** What each kind of target can be, as the id/name lists the page loaded. */
export type TargetOptions = Record<ObjectiveTargetKind, Array<{ id: string; name: string }>>;

interface ObjectivesEditorProps {
  value: ObjectiveDefinition[];
  targets: TargetOptions;
  onChange: (objectives: ObjectiveDefinition[]) => void;
}

const KIND_NOUN: Record<ObjectiveTargetKind, string> = { item: 'item', mob: 'mob', fluid: 'fluid', gas: 'gas' };

/**
 * The objectives of a mission: one row each, with a type from the registry, a target picker that lists the right table for the
 * type (items, mobs, fluids or gases) and an amount whose meaning follows the type.
 */
const ObjectivesEditor: React.FC<ObjectivesEditorProps> = ({ value, targets, onChange }) => {
  const update = (index: number, next: ObjectiveDefinition) => onChange(value.map((o, i) => (i === index ? next : o)));

  return (
    <section className={`objectives-editor ${panelClass}`} data-testid="objectives-editor">
      <div>
        <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Objectives</h4>
        <p className={hintClass}>What the player has to do. Everything must be done to complete the mission. Up to {MAX_MISSION_OBJECTIVES}.</p>
      </div>

      {value.map((objective, i) => {
        const def = isObjectiveType(objective.type) ? OBJECTIVE_TYPES[objective.type] : null;
        const kind = def?.targetKind ?? null;
        return (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" data-testid={`objective-${i}`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label htmlFor={`objective-type-${i}`} className={labelClass}>Type</label>
                <select
                  id={`objective-type-${i}`}
                  aria-label={`Objective ${i + 1} type`}
                  value={objective.type}
                  onChange={(e) => update(i, newObjective(e.target.value as ObjectiveDefinition['type']))}
                  className={`${inputClass} cursor-pointer`}
                >
                  {AVAILABLE_OBJECTIVE_TYPES.map((t) => (
                    <option key={t} value={t}>{OBJECTIVE_TYPES[t].label}</option>
                  ))}
                </select>
              </div>

              {kind ? (
                <div className="space-y-1">
                  <label htmlFor={`objective-target-${i}`} className={labelClass}>{def?.targetRequired ? `Which ${KIND_NOUN[kind]}` : `Which ${KIND_NOUN[kind]} (any if empty)`}</label>
                  <select
                    id={`objective-target-${i}`}
                    aria-label={`Objective ${i + 1} target`}
                    value={objective.targetId ?? ''}
                    onChange={(e) => update(i, { ...objective, targetId: e.target.value === '' ? null : e.target.value })}
                    className={`${inputClass} cursor-pointer`}
                  >
                    <option value="">{def?.targetRequired ? `Choose a ${KIND_NOUN[kind]}…` : `Any ${KIND_NOUN[kind]}`}</option>
                    {targets[kind].map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className={labelClass}>Target</span>
                  <p className="text-xs text-slate-400 font-semibold pt-2">This objective takes no target.</p>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor={`objective-amount-${i}`} className={labelClass}>{def?.amountLabel ?? 'Amount'}</label>
                <input
                  id={`objective-amount-${i}`}
                  aria-label={`Objective ${i + 1} amount`}
                  type="number"
                  min={def?.minAmount ?? 1}
                  max={def?.maxAmount}
                  step={1}
                  value={show(objective.amount)}
                  onChange={(e) => update(i, { ...objective, amount: readNumber(e.target.value) })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="button" aria-label={`Remove objective ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className={dangerButtonClass}>
                Remove
              </button>
            </div>
          </div>
        );
      })}

      {value.length === 0 && <p className="text-xs text-slate-400 font-semibold italic">No objectives yet: a mission needs at least one.</p>}
      <button type="button" disabled={value.length >= MAX_MISSION_OBJECTIVES} onClick={() => onChange([...value, newObjective('MINE_ITEM')])} className={buttonClass}>
        + Add Objective
      </button>
    </section>
  );
};

export default ObjectivesEditor;
