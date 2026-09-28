// The departments this company actually has — the list the Add/Edit User form
// has always offered, lifted out of app/users/UsersClient.jsx so a second
// screen (Help Tickets, which files a ticket against a department) can use the
// same one instead of inventing a parallel IT/HR/Accounts enum that would
// drift from it.
//
// Departments added on the fly from the user form live in the app_config
// table under `custom_departments` and come back from /api/departments —
// mergeDepartments() folds those in without duplicating anything already here.
export const DEPARTMENTS = [
  { value: 'Process Coordinator',         label: 'Process Coordinator'         },
  { value: 'Sales Person',                label: 'Sales Person'                },
  { value: 'Client Relationship Manager', label: 'Client Relationship Manager' },
  { value: 'Executive Assistant',         label: 'Executive Assistant'         },
  { value: 'Accounts',                    label: 'Accounts'                    },
  { value: 'Business Coordinator',        label: 'Business Coordinator'        },
  { value: 'HOD Production',              label: 'HOD Production'              },
  { value: 'SC',                          label: 'SC'                          },
  { value: 'HR',                          label: 'HR'                          },
  { value: 'Runner',                      label: 'Runner'                      },
  { value: 'Dispatch',                    label: 'Dispatch'                    },
  { value: 'Designer',                    label: 'Designer'                    },
  { value: 'Management',                  label: 'Management'                  },
];

export function mergeDepartments(custom = []) {
  return [
    ...DEPARTMENTS,
    ...custom
      .filter((name) => !DEPARTMENTS.some((d) => d.value.toLowerCase() === String(name).toLowerCase()))
      .map((name) => ({ value: name, label: name })),
  ];
}
