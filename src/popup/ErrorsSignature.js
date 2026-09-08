/**
 * A cheap fingerprint of everything the error list actually renders.
 *
 * An unchanged signature means a re-render would produce identical DOM, so the
 * popup can skip it — which avoids the flicker and lost scroll position that
 * revalidating on focus would otherwise cause.
 */
export function buildErrorsSignature(errors) {
    return errors
        .map((error) =>
            [
                error.id,
                error.status ?? 'open',
                error.comments?.length ?? 0,
                error.comments?.[error.comments.length - 1]?.text ?? '',
                (error.bug_list_ids ?? []).join('.'),
                error.breakpoint?.type ?? '',
                error.url ?? '',
            ].join(':'),
        )
        .join('|');
}
