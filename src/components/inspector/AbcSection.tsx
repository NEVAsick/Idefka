import type { Box, Model } from '../../model/types';
import { costOf, formatMoney } from '../../model/abc';
import { setState } from '../../store';
import { editBox, Field, parseNumber } from './controls';

export function AbcSection({ model, diagramId, box }: { model: Model; diagramId: string; box: Box }) {
  const cost = costOf(model, box);
  const { centers, currency, timeUnit } = model.abc;
  const edit = (change: (target: Box) => void, key: string) => editBox(diagramId, box.id, change, key + box.id);

  return (
    <div className="abc-block">
      <div className="insp-section-row">
        <span className="insp-section">Стоимость (ABC)</span>
        <button className="link-btn" onClick={() => setState({ dialog: { kind: 'abc' } })}>
          Центры затрат и отчёт
        </button>
      </div>

      <div className="two-cols">
        <Field label="Частота">
          <input inputMode="decimal" value={box.frequency ?? 1} onChange={(e) => edit((b) => (b.frequency = parseNumber(e.target.value)), 'freq')} />
        </Field>
        <Field label={`Длительность, ${timeUnit}`}>
          {cost.computed ? (
            <input value={String(Math.round(cost.duration * 100) / 100)} readOnly className="readonly" />
          ) : (
            <input inputMode="decimal" value={box.duration ?? 0} onChange={(e) => edit((b) => (b.duration = parseNumber(e.target.value)), 'dur')} />
          )}
        </Field>
      </div>

      {centers.length === 0 && <p className="field-hint">Добавьте центры затрат (например, «Зарплата», «Оборудование»), чтобы задать стоимость работ.</p>}

      {centers.map((center) => (
        <Field key={center.id} label={center.name || 'Центр затрат'}>
          {cost.computed ? (
            <input readOnly className="readonly" value={formatMoney(cost.byCenter[center.id] ?? 0, currency)} />
          ) : (
            <input
              inputMode="decimal"
              value={box.costs?.[center.id] ?? 0}
              onChange={(e) => edit((b) => (b.costs = { ...(b.costs ?? {}), [center.id]: parseNumber(e.target.value) }), 'cost' + center.id)}
            />
          )}
        </Field>
      ))}

      {centers.length > 0 && (
        <div className="abc-total">
          <span>Итого{cost.computed ? ' (по декомпозиции)' : ''}</span>
          <b>{formatMoney(cost.total, currency)}</b>
        </div>
      )}
    </div>
  );
}
