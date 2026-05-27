'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import CsvImport from '../components/CsvImport';

const ROLES = ['Admin', 'User', 'HOD'];

const ROLE_STYLE = {
  Admin: 'bg-amber-50 text-amber-700 border-amber-200',
  User: 'bg-primary-50 text-primary-700 border-primary-200',
  HOD: 'bg-violet-50 text-violet-700 border-violet-200',
};

const ROLE_ICON = {
  Admin: (p) => (
    <svg
      {...p}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7Z" />
    </svg>
  ),

  HOD: (p) => (
    <svg
      {...p}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  ),

  User: (p) => (
    <svg
      {...p}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

export default function UsersClient({ users = [], departments = [] }) {
  const router = useRouter();

  const { data: session } = useSession();

  const isAdmin =
    Array.isArray(session?.user?.roles) &&
    session.user.roles.includes('Admin');

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  function normalizeRoles(roles) {
    if (Array.isArray(roles)) return roles;

    if (typeof roles === 'string') {
      return roles
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
    }

    return ['User'];
  }

  const filtered = users.filter((u) => {
    if (!search) return true;

    const s = search.toLowerCase();

    return (
      (u?.name || '').toLowerCase().includes(s) ||
      (u?.email || '').toLowerCase().includes(s) ||
      (u?.department || '').toLowerCase().includes(s) ||
      normalizeRoles(u?.roles).some((r) =>
        (r || '').toLowerCase().includes(s)
      )
    );
  });

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(u) {
    setEditing({
      ...u,
      roles: normalizeRoles(u?.roles),
    });

    setModalOpen(true);
  }

  async function deleteUser(id) {
    if (!confirm('Delete this user?')) return;

    await fetch('/api/users?id=' + id, {
      method: 'DELETE',
    });

    router.refresh();
  }

  const stats = users.reduce((acc, u) => {
    normalizeRoles(u?.roles).forEach((r) => {
      acc[r] = (acc[r] || 0) + 1;
    });

    return acc;
  }, {});

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Users</h1>

          <p className="page-sub">
            Manage team members, roles, and department assignments
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <CsvImport
              templateName="users_template.csv"
              columns={[
                'name',
                'email',
                'phone',
                'department',
                'roles',
              ]}
              sampleRow={[
                'Tushar Singh',
                'tushar@example.com',
                '9876543210',
                departments[0] || 'Operations',
                'User;Admin',
              ]}
              parseRow={(r) => {
                if (!r.name || !r.email) return null;

                const roles = (r.roles || 'User')
                  .split(/[;|,]/)
                  .map((x) => x.trim())
                  .filter(Boolean);

                return {
                  name: r.name,
                  email: r.email,
                  phone: r.phone || '',
                  department:
                    r.department || (departments[0] || ''),
                  roles: roles.length ? roles : ['User'],
                };
              }}
              endpoint="/api/users"
              onDone={() => router.refresh()}
            />

            <button onClick={openAdd} className="btn-primary">
              <PlusIcon />
              Add User
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th">User</th>
                <th className="table-th">Email</th>
                <th className="table-th">Phone</th>
                <th className="table-th">Department</th>
                <th className="table-th">Roles</th>

                {isAdmin && (
                  <th className="table-th w-48">
                    Action
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="table-row">
                  <td className="table-td">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u?.name || ''} />

                      <div>
                        <div className="font-medium text-slate-900">
                          {u?.name || 'Unknown'}
                        </div>

                        <div className="text-[11px] text-slate-500">
                          {u?.department || '—'}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="table-td text-slate-600">
                    {u?.email || '—'}
                  </td>

                  <td className="table-td text-slate-600">
                    {u?.phone || '—'}
                  </td>

                  <td className="table-td text-slate-600">
                    {u?.department || '—'}
                  </td>

                  <td className="table-td">
                    <div className="flex flex-wrap gap-1">
                      {normalizeRoles(u?.roles).map((r) => {
                        const Icon = ROLE_ICON[r];

                        return (
                          <span
                            key={r}
                            className={`pill border ${
                              ROLE_STYLE[r] ||
                              'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {Icon && (
                              <Icon className="w-3 h-3" />
                            )}

                            {r}
                          </span>
                        );
                      })}
                    </div>
                  </td>

                  {isAdmin && (
                    <td className="table-td">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => openEdit(u)}
                          className="pill bg-primary-50 text-primary-700 hover:bg-primary-100 cursor-pointer"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => deleteUser(u.id)}
                          className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        user={editing}
        departments={departments}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function UserModal({
  open,
  onClose,
  user,
  departments,
  onSaved,
}) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  function normalizeRoles(roles) {
    if (Array.isArray(roles)) return roles;

    if (typeof roles === 'string') {
      return roles
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
    }

    return ['User'];
  }

  useEffect(() => {
    if (open) {
      if (user) {
        setForm({
          id: user.id,
          name: user.name || '',
          email: user.email || '',
          phone: user.phone || '',
          department:
            user.department || departments[0] || '',
          roles: normalizeRoles(user.roles),
        });
      } else {
        setForm({
          name: '',
          email: '',
          phone: '',
          department: departments[0] || '',
          roles: ['User'],
        });
      }
    }
  }, [user, open, departments]);

  if (!open) return null;

  function toggleRole(r) {
    const roles = normalizeRoles(form.roles).includes(r)
      ? normalizeRoles(form.roles).filter(
          (x) => x !== r
        )
      : [...normalizeRoles(form.roles), r];

    setForm({
      ...form,
      roles,
    });
  }

  async function save() {
    setSaving(true);

    const method = user ? 'PATCH' : 'POST';

    await fetch('/api/users', {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(form),
    });

    setSaving(false);

    onClose();
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-5">
          {user ? 'Edit User' : 'Add User'}
        </h2>

        <div className="space-y-4">
          <Field
            label="Name"
            value={form.name || ''}
            onChange={(v) =>
              setForm({
                ...form,
                name: v,
              })
            }
          />

          <Field
            label="Email"
            value={form.email || ''}
            onChange={(v) =>
              setForm({
                ...form,
                email: v,
              })
            }
          />

          <Field
            label="Phone"
            value={form.phone || ''}
            onChange={(v) =>
              setForm({
                ...form,
                phone: v,
              })
            }
          />

          <div>
            <label className="label">
              Department
            </label>

            <select
              value={form.department || ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  department: e.target.value,
                })
              }
              className="input"
            >
              {departments.map((d) => (
                <option key={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">
              Roles
            </label>

            <div className="flex gap-2 flex-wrap">
              {ROLES.map((r) => {
                const active =
                  normalizeRoles(form.roles).includes(r);

                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition ${
                      active
                        ? ROLE_STYLE[r]
                        : 'bg-white text-slate-500 border-slate-200'
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Cancel
          </button>

          <button
            onClick={save}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}) {
  return (
    <div>
      <label className="label">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="input"
      />
    </div>
  );
}

function Avatar({ name = '' }) {
  const ini = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white grid place-items-center text-[11px] font-bold">
      {ini || 'U'}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}