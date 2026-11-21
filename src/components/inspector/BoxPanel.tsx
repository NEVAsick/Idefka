import type { Arrow, Box, EventTrigger, GatewayType, JunctionType, Model, NodeKind } from '../../model/types';
import { boxNumber, isContext, labelOf, ROLE_NAME } from '../../model/query';
import { removeDecomposition } from '../../model/ops';
import { FRAGMENT_OPERATORS, GATEWAYS, hasCompartments, JUNCTIONS, KINDS, TRIGGERS, type Choice } from '../../model/notation';
import { neededHeight } from '../../model/compartments';
import { commit, toast } from '../../store';
import { decomposeSelected, deleteSelection } from '../../actions';
import { Icon } from '../icons';
import { AbcSection } from './AbcSection';
import { editBox, Field, Segmented } from './controls';

type Edit = (change: (box: Box) => void, key?: string) => void;
type TextField = 'attrs' | 'ops' | 'keys' | 'stereotype';

const NAME_LABEL: Partial<Record<NodeKind, string>> = {
  fragment: 'Условие',
  lifeline: 'Объект',
  actorLine: 'Актёр',
  umlNote: 'Текст примечания',
  partition: 'Исполнитель',
};

const NAME_PLACEHOLDER: Partial<Record<NodeKind, string>> = {
  activity: 'Глагол + объект, например «Обработать заказ»',
  epcFunction: 'Например, «Проверить заказ»',
  epcEvent: 'Например, «Заказ получен»',
  useCase: 'Например, «Оформить заказ»',
  lifeline: 'Например, «заказ : Заказ»',
  fragment: 'Например, «[товар есть на складе]»',
  action: 'Например, «Проверить оплату»',
};

const STEREOTYPED = new Set<NodeKind>(['class', 'interface', 'enumeration', 'deployNode', 'device', 'component', 'artifact']);
const STEREOTYPE_PLACEHOLDER: Partial<Record<NodeKind, string>> = {
  interface: 'interface',
  enumeration: 'enumeration',
  device: 'device',
  artifact: 'artifact',
};
const CLASSIFIERS = new Set<NodeKind>(['class', 'interface', 'enumeration']);
const EVENTS = new Set<NodeKind>(['startEvent', 'intermediateEvent', 'endEvent']);

const EPC_OPERATORS: Choice<JunctionType>[] = [
  { value: 'and', label: 'И  ∧' },
  { value: 'or', label: 'ИЛИ  ∨' },
  { value: 'xor', label: 'Искл. ИЛИ' },
];

const EVENT_KINDS: Choice<string>[] = [
  { value: 'startEvent', label: 'Начальное' },
  { value: 'intermediateEvent', label: 'Промежут.' },
  { value: 'endEvent', label: 'Конечное' },
];

const GATEWAY_OPTIONS = (Object.keys(GATEWAYS) as GatewayType[]).map((value) => ({ value, label: GATEWAYS[value] }));
const JUNCTION_OPTIONS = (['and', 'or', 'xor'] as JunctionType[]).map((value) => ({ value, label: `${JUNCTIONS[value].symbol}  ${JUNCTIONS[value].title}` }));
const SYNC_OPTIONS: Choice<'a' | 's'>[] = [
  { value: 'a', label: 'Асинхронный' },
  { value: 's', label: 'Синхронный' },
];

function allowedTriggers(kind: NodeKind) {
  return (Object.keys(TRIGGERS) as EventTrigger[]).filter((t) => (t !== 'terminate' || kind === 'endEvent') && (t !== 'error' || kind !== 'startEvent'));
}

function EventFields({ box, edit }: { box: Box; edit: Edit }) {
  const changeKind = (kind: string) =>
    edit((b) => {
      b.kind = kind as NodeKind;
      if (b.trigger === 'terminate' && kind !== 'endEvent') b.trigger = 'none';
    });

  return (
    <>
      <Field label="Вид события">
        <Segmented<string> value={box.kind} options={EVENT_KINDS} onChange={changeKind} />
      </Field>
      <Field label="Триггер">
        <select value={box.trigger ?? 'none'} onChange={(e) => edit((b) => (b.trigger = e.target.value as EventTrigger))}>
          {allowedTriggers(box.kind).map((t) => (
            <option key={t} value={t}>
              {TRIGGERS[t]}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

function JunctionFields({ box, edit }: { box: Box; edit: Edit }) {
  return (
    <>
      <Field label="Тип перекрёстка">
        <Segmented<JunctionType> value={box.junction ?? 'xor'} options={JUNCTION_OPTIONS} onChange={(v) => edit((b) => (b.junction = v))} cols={1} />
      </Field>
      <Field label="Синхронность">
        <Segmented<'a' | 's'> value={box.sync ? 's' : 'a'} options={SYNC_OPTIONS} onChange={(v) => edit((b) => (b.sync = v === 's'))} />
      </Field>
    </>
  );
}

function CompartmentFields({ box, setText }: { box: Box; setText: (field: TextField, value: string) => void }) {
  if (box.kind === 'entity') {
    return (
      <>
        <Field label="Первичный ключ" hint="По одному атрибуту в строке.">
          <textarea className="mono" rows={2} value={box.keys ?? ''} onChange={(e) => setText('keys', e.target.value)} placeholder="id" />
        </Field>
        <Field label="Атрибуты" hint="По одному в строке. Внешний ключ — допишите «(FK)».">
          <textarea className="mono" rows={5} value={box.attrs ?? ''} onChange={(e) => setText('attrs', e.target.value)} placeholder={'name\ncreated_at\ncustomer_id (FK)'} />
        </Field>
      </>
    );
  }

  if (!CLASSIFIERS.has(box.kind)) return null;
  const enumeration = box.kind === 'enumeration';
  return (
    <>
      <Field label={enumeration ? 'Значения' : 'Атрибуты'} hint="По одному в строке.">
        <textarea
          className="mono"
          rows={4}
          value={box.attrs ?? ''}
          onChange={(e) => setText('attrs', e.target.value)}
          placeholder={enumeration ? 'NEW\nPAID\nSHIPPED' : '- id: int\n- name: string\n+ total: decimal'}
        />
      </Field>
      <Field label="Операции" hint="По одной в строке.">
        <textarea className="mono" rows={3} value={box.ops ?? ''} onChange={(e) => setText('ops', e.target.value)} placeholder={'+ getTotal(): decimal\n+ pay(): void'} />
      </Field>
    </>
  );
}

function TextFields({ box, edit }: { box: Box; edit: Edit }) {
  const compartments = hasCompartments(box.kind);

  const setText = (field: TextField, value: string) =>
    edit((b) => {
      b[field] = value;
      if (hasCompartments(b.kind)) {
        const centerY = b.y + b.h / 2;
        b.h = neededHeight(b);
        b.y = centerY - b.h / 2;
      }
    }, field);

  return (
    <>
      {!KINDS[box.kind].noName && (
        <Field label={NAME_LABEL[box.kind] ?? 'Название'} hint={compartments ? undefined : 'Shift+Enter — перенос строки'}>
          <textarea
            rows={compartments ? 1 : 2}
            value={box.name}
            onChange={(e) => edit((b) => (b.name = e.target.value), 'name')}
            placeholder={NAME_PLACEHOLDER[box.kind] ?? 'Название'}
          />
        </Field>
      )}
      {STEREOTYPED.has(box.kind) && (
        <Field label="Стереотип" hint={box.kind === 'class' ? 'Например, abstract, entity, controller. «abstract» — имя курсивом.' : undefined}>
          <input value={box.stereotype ?? ''} onChange={(e) => setText('stereotype', e.target.value)} placeholder={STEREOTYPE_PLACEHOLDER[box.kind] ?? 'Без стереотипа'} />
        </Field>
      )}
      <CompartmentFields box={box} setText={setText} />
      <Field label="Определение">
        <textarea rows={3} value={box.note} onChange={(e) => edit((b) => (b.note = e.target.value), 'note')} placeholder="Что это и зачем" />
      </Field>
    </>
  );
}

function IcomStats({ box, arrows }: { box: Box; arrows: Arrow[] }) {
  const into = (side: string) => arrows.filter((a) => a.to.t === 'box' && a.to.box === box.id && a.to.side === side).length;
  const stats = [
    ['I', into('left')],
    ['C', into('top')],
    ['O', arrows.filter((a) => a.from.t === 'box' && a.from.box === box.id).length],
    ['M', into('bottom')],
  ] as const;

  return (
    <div className="icom-stats">
      {stats.map(([role, count]) => (
        <div key={role} className={'icom-stat r-' + role + (count ? '' : ' zero')}>
          <b>{count}</b>
          <span>{ROLE_NAME[role]}</span>
        </div>
      ))}
    </div>
  );
}

function SquiggleTarget({ model, box, arrows, edit }: { model: Model; box: Box; arrows: Arrow[]; edit: Edit }) {
  const choose = (arrowId: string) =>
    edit((b) => {
      if (arrowId) b.squiggleTo = arrowId;
      else delete b.squiggleTo;
    });

  return (
    <Field label="Молния к стрелке" hint="Зигзаг, который связывает этот текст со стрелкой, как в BPwin.">
      <select value={box.squiggleTo ?? ''} onChange={(e) => choose(e.target.value)}>
        <option value="">Нет</option>
        {arrows.map((a) => (
          <option key={a.id} value={a.id}>
            {labelOf(model, a) || 'Стрелка без названия'}
          </option>
        ))}
      </select>
    </Field>
  );
}

function decomposeLabel(box: Box) {
  const task = box.kind === 'task';
  if (box.child) return task ? 'Открыть подпроцесс' : 'Открыть декомпозицию';
  return task ? 'Развернуть в подпроцесс…' : 'Декомпозировать…';
}

function BoxActions({ model, diagramId, box }: { model: Model; diagramId: string; box: Box }) {
  const removeChild = () => {
    commit((draft) => removeDecomposition(draft, diagramId, box.id));
    toast('Декомпозиция удалена. Вернуть: Ctrl+Z');
  };
  const deletable = !(isContext(model.diagrams[diagramId]) && box.kind === 'activity');

  return (
    <div className="insp-actions">
      {KINDS[box.kind].decomposable && (
        <button className="btn primary" onClick={() => decomposeSelected(box.id)}>
          <Icon.down />
          {decomposeLabel(box)}
        </button>
      )}
      {box.child && (
        <button className="btn" onClick={removeChild}>
          Удалить декомпозицию
        </button>
      )}
      {deletable && (
        <button className="btn danger" onClick={deleteSelection}>
          <Icon.trash />
          Удалить
        </button>
      )}
    </div>
  );
}

export function BoxPanel({ model, diagramId, box }: { model: Model; diagramId: string; box: Box }) {
  const diagram = model.diagrams[diagramId];
  const edit: Edit = (change, key) => editBox(diagramId, box.id, change, key && `${key}-${box.id}`);

  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">{KINDS[box.kind].title}</span>
        <span className="insp-num">{boxNumber(model, diagramId, box.id)}</span>
      </div>

      {box.kind === 'epcConnector' && (
        <Field label="Оператор">
          <Segmented<JunctionType> value={box.junction ?? 'xor'} options={EPC_OPERATORS} onChange={(v) => edit((b) => (b.junction = v))} />
        </Field>
      )}

      {box.kind === 'fragment' && (
        <Field label="Оператор фрагмента">
          <select value={box.stereotype ?? 'alt'} onChange={(e) => edit((b) => (b.stereotype = e.target.value))}>
            {FRAGMENT_OPERATORS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      {EVENTS.has(box.kind) && <EventFields box={box} edit={edit} />}

      {box.kind === 'gateway' && (
        <Field label="Тип шлюза">
          <Segmented<GatewayType> value={box.gateway ?? 'xor'} options={GATEWAY_OPTIONS} onChange={(v) => edit((b) => (b.gateway = v))} cols={2} />
        </Field>
      )}

      {box.kind === 'junction' ? <JunctionFields box={box} edit={edit} /> : <TextFields box={box} edit={edit} />}

       <Field label="Размер шрифта">
        <input
          type="number"
          min={8}
          max={72}
          value={box.fontSize ?? 13}
          onChange={(e) => edit((b) => (b.fontSize = Number(e.target.value) || undefined))}
        />
      </Field>

      {box.kind === 'activity' && (
        <>
          <IcomStats box={box} arrows={diagram.arrows} />
          <AbcSection model={model} diagramId={diagramId} box={box} />
        </>
      )}

      {box.kind === 'text' && diagram.arrows.length > 0 && <SquiggleTarget model={model} box={box} arrows={diagram.arrows} edit={edit} />}

      <BoxActions model={model} diagramId={diagramId} box={box} />
    </>
  );
}
