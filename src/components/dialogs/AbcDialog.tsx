import type { Model } from '../../model/types';
import { commit, useStore } from '../../store';
import { abcRows, formatMoney, type AbcRow } from '../../model/abc';
import { uid } from '../../model/ops';
import { exportAbcCsv } from '../../actions';
import { Icon } from '../icons';

type AbcSettings = Model['abc'];
type CostCenter = AbcSettings['centers'][number];

const editAbc = (change: (abc: AbcSettings) => void, coalesceKey?: string) =>
  commit((draft) => {
    change(draft.abc);
  }, coalesceKey);

const renameCenter = (id: string, name: string) =>
  editAbc((abc) => {
    const center = abc.centers.find((c) => c.id === id);
    if (center) center.name = name;
  }, 'center-' + id);

const removeCenter = (id: string) =>
  editAbc((abc) => {
    abc.centers = abc.centers.filter((c) => c.id !== id);
  });

const addCenter = () =>
  editAbc((abc) => {
    abc.centers.push({ id: uid('c'), name: `Центр затрат ${abc.centers.length + 1}`, note: '' });
  });

function CostCenters({ abc }: { abc: AbcSettings }) {
  return (
    <section>
      <div className="field-label" style={{ marginBottom: 6 }}>
        Центры затрат
      </div>
      {abc.centers.map((center) => (
        <div key={center.id} className="center-row">
          <input value={center.name} placeholder="Например, «Зарплата»" onChange={(e) => renameCenter(center.id, e.target.value)} />
          <button className="tb-icon" aria-label="Удалить центр затрат" onClick={() => removeCenter(center.id)}>
            <Icon.trash />
          </button>
        </div>
      ))}
      <button className="btn" onClick={addCenter}>
        <Icon.plus />
        Добавить центр затрат
      </button>
      <div className="two-cols" style={{ marginTop: 14 }}>
        <label className="field">
          <span className="field-label">Валюта</span>
          <input value={abc.currency} onChange={(e) => editAbc((a) => (a.currency = e.target.value), 'currency')} />
        </label>
        <label className="field">
          <span className="field-label">Единица времени</span>
          <input value={abc.timeUnit} onChange={(e) => editAbc((a) => (a.timeUnit = e.target.value), 'timeunit')} />
        </label>
      </div>
      <label className="check" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={abc.show} onChange={(e) => editAbc((a) => (a.show = e.target.checked))} />
        Показывать стоимость на работах
      </label>
    </section>
  );
}

function ReportRow({ row, centers, currency }: { row: AbcRow; centers: CostCenter[]; currency: string }) {
  const { box, cost } = row;
  return (
    <tr className={cost.computed ? 'computed' : ''}>
      <td>{row.number}</td>
      <td style={{ paddingLeft: 8 + row.depth * 14 }}>{box.name}</td>
      <td className="num">{box.frequency ?? 1}</td>
      <td className="num">{Math.round(cost.duration * 100) / 100}</td>
      {centers.map((c) => (
        <td key={c.id} className="num">
          {formatMoney(cost.byCenter[c.id] ?? 0, '')}
        </td>
      ))}
      <td className="num">
        <b>{formatMoney(cost.total, currency)}</b>
      </td>
    </tr>
  );
}

function Report({ model }: { model: Model }) {
  const { centers, currency } = model.abc;
  return (
    <section className="abc-report">
      <div className="field-label" style={{ marginBottom: 6 }}>
        Отчёт по работам
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Номер</th>
              <th>Работа</th>
              <th className="num">Частота</th>
              <th className="num">Длит.</th>
              {centers.map((c) => (
                <th key={c.id} className="num">
                  {c.name}
                </th>
              ))}
              <th className="num">Итого</th>
            </tr>
          </thead>
          <tbody>
            {abcRows(model).map((row) => (
              <ReportRow key={row.box.id} row={row} centers={centers} currency={currency} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-hint">Строки с рассчитанной стоимостью (по декомпозиции) выделены. Значения у самих работ задаются в панели свойств справа.</p>
    </section>
  );
}

export function AbcDialog({ close }: { close: () => void }) {
  const { model } = useStore();
  return (
    <div className="abc-dialog">
      <h2>Стоимостной анализ (ABC)</h2>
      <p className="modal-text">
        Задайте центры затрат и стоимость недекомпозированных работ. Стоимость родительской работы считается сама: сумма дочерних работ × их частота.
      </p>
      <div className="abc-grid">
        <CostCenters abc={model.abc} />
        <Report model={model} />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={exportAbcCsv}>
          <Icon.table />
          Сохранить отчёт (CSV для Excel)
        </button>
        <button className="btn primary" onClick={close}>
          Готово
        </button>
      </div>
    </div>
  );
}
