import { useState } from 'react';
import { upsertCategorySchema, type UpsertCategoryDto } from '@app/shared';
import { api, type AdminCategory } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { AsyncContent, EmptyState } from '../components/states';
import { Modal } from '../components/Modal';
import { slugify } from '../lib/format';

/** Категории каталога: порядок на главном экране, видимость, удаление. */
export function CategoriesPage() {
  const list = useAsync(() => api.categories(), []);
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (category: AdminCategory) => {
    setError(null);
    try {
      await api.deleteCategory(category.id);
      list.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить');
    }
  };

  const toggleActive = async (category: AdminCategory) => {
    setError(null);
    try {
      await api.updateCategory(category.id, {
        name: category.name,
        slug: category.slug,
        icon: category.icon,
        sortOrder: category.sortOrder,
        isActive: !category.isActive,
      });
      list.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Категории</h1>
          <p>Порядок определяет расположение на главном экране приложения</p>
        </div>
        <button type="button" className="button" onClick={() => setEditing('new')}>
          + Добавить
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <AsyncContent state={list}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState title="Категорий пока нет" hint="Добавьте первую — без них каталог пуст" />
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}>Порядок</th>
                      <th>Категория</th>
                      <th>Slug</th>
                      <th>Специалистов</th>
                      <th>Видимость</th>
                      <th style={{ width: 170 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((category) => (
                      <tr key={category.id}>
                        <td className="cell-muted">{category.sortOrder}</td>
                        <td className="cell-primary">
                          {category.icon} {category.name}
                        </td>
                        <td className="cell-muted">{category.slug}</td>
                        <td>{category._count.specialists}</td>
                        <td>
                          <span className={category.isActive ? 'badge badge--success' : 'badge'}>
                            {category.isActive ? 'Показывается' : 'Скрыта'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="button button--secondary button--sm"
                              onClick={() => setEditing(category)}
                            >
                              Изменить
                            </button>
                            <button
                              type="button"
                              className="button button--secondary button--sm"
                              onClick={() => toggleActive(category)}
                            >
                              {category.isActive ? 'Скрыть' : 'Показать'}
                            </button>
                            {category._count.specialists === 0 && (
                              <button
                                type="button"
                                className="button button--secondary button--sm"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => remove(category)}
                              >
                                Удалить
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }
      </AsyncContent>

      <p className="cell-muted" style={{ marginTop: 14 }}>
        Категорию со специалистами удалить нельзя — сначала перенесите карточки. Чтобы просто убрать
        её с главного экрана, воспользуйтесь кнопкой «Скрыть»: связи при этом сохранятся.
      </p>

      {editing && (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </>
  );
}

function CategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  category: AdminCategory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [icon, setIcon] = useState(category?.icon ?? '🔧');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [slugTouched, setSlugTouched] = useState(Boolean(category));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const parsed = upsertCategorySchema.safeParse({
      name: name.trim(),
      slug: slug.trim(),
      icon: icon.trim(),
      sortOrder: Number(sortOrder),
      isActive,
    } satisfies Partial<UpsertCategoryDto>);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Проверьте поля');
      return;
    }

    setSaving(true);
    try {
      if (category) await api.updateCategory(category.id, parsed.data);
      else await api.createCategory(parsed.data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={category ? 'Изменить категорию' : 'Новая категория'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button--secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="button" onClick={submit} disabled={saving}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert--error">{error}</div>}

      <form onSubmit={submit}>
        <div className="field">
          <span className="field__label">Название</span>
          <input
            className="input"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
          />
        </div>

        <div className="field">
          <span className="field__label">Slug</span>
          <input
            className="input"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
          />
          <span className="field__hint">Латиница, цифры и дефис. Используется в ссылках и фильтрах.</span>
        </div>

        <div className="form-grid">
          <div className="field">
            <span className="field__label">Иконка</span>
            <input
              className="input"
              value={icon}
              maxLength={4}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🔧"
            />
            <span className="field__hint">Один эмодзи</span>
          </div>
          <div className="field">
            <span className="field__label">Порядок</span>
            <input
              className="input"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
            <span className="field__hint">Меньше — выше в списке</span>
          </div>
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span>Показывать на главном экране</span>
        </label>
      </form>
    </Modal>
  );
}
