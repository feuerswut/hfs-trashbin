'use strict'; {
    const { h, React, onEvent, customRestCall, toast, dialogLib } = HFS
    const { useState, useEffect } = React
    const { newDialog } = dialogLib

    // ── Trash dialog content ───────────────────────────────────────────────────
    function TrashContent() {
        const [items, setItems] = useState(null)
        const [busy,  setBusy]  = useState(false)

        function reload() {
            setItems(null)
            customRestCall('trashbin_list').then(setItems)
        }

        useEffect(reload, [])

        async function act(fn) {
            setBusy(true)
            try { await fn() } finally { setBusy(false) }
        }

        async function restore(item) {
            await act(async () => {
                const res = await customRestCall('trashbin_restore', { id: item.id })
                if (res?.error) return toast(res.error, 'error')
                toast('Restored: ' + item.name, 'success')
                reload()
            })
        }

        async function remove(item) {
            await act(async () => {
                const res = await customRestCall('trashbin_delete', { id: item.id })
                if (res?.error) return toast(res.error, 'error')
                toast('Permanently deleted: ' + item.name, 'success')
                reload()
            })
        }

        if (items === null)
            return h('div', { style: { padding: '1em', textAlign: 'center' } }, 'Loading…')

        if (!items.length)
            return h('div', { style: { padding: '1.5em', textAlign: 'center', color: 'var(--color-dim, #888)' } }, 'Trash is empty')

        return h('div', { style: { minWidth: '420px' } },
            items.map(item =>
                h('div', {
                    key: item.id,
                    style: {
                        display: 'flex', gap: '0.75em', alignItems: 'center',
                        padding: '0.5em 0.75em', borderBottom: '1px solid var(--color-border, #e0e0e0)'
                    }
                },
                    h('div', { style: { flex: 1, minWidth: 0 } },
                        h('div', {
                            style: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                            title: item.origin,
                        }, item.name),
                        h('div', { style: { fontSize: '0.75em', opacity: 0.6, marginTop: '0.1em' } },
                            new Date(item.deletedAt * 1000).toLocaleString()
                        ),
                    ),
                    h('button', {
                        disabled: busy,
                        onClick: () => restore(item),
                        style: { cursor: busy ? 'not-allowed' : 'pointer', padding: '0.25em 0.6em' },
                        title: 'Restore to original location',
                    }, 'Restore'),
                    h('button', {
                        disabled: busy,
                        onClick: () => remove(item),
                        style: { cursor: busy ? 'not-allowed' : 'pointer', padding: '0.25em 0.6em', background: 'var(--color-error, #c00)', color: '#fff', border: 'none', borderRadius: '3px' },
                        title: 'Permanently delete',
                    }, 'Delete'),
                )
            )
        )
    }

    // ── Menu bar button ────────────────────────────────────────────────────────
    onEvent('appendMenuBar', () => {
        const open = () => newDialog({ title: 'Trash', Content: TrashContent })
        return h(HFS.Btn, { icon: 'delete', label: 'Trash', tooltip: 'Trash bin', onClick: open })
    })
}
