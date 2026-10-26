// Settle each resource independently: a slow inbox must not hide a received invitation.
export function createCommunityRefresh({ get, isCurrent, resources }) {
  const slots = resources.map(resource => ({ ...resource, requested: 0, applied: 0 }));
  return () => Promise.allSettled(slots.map(async slot => {
    const version = ++slot.requested;
    try {
      const { data } = await get(slot.path, { timeout: 10000 });
      if (!isCurrent() || version < slot.applied) return;
      slot.applied = version;
      slot.apply(data);
    } catch (error) {
      if (isCurrent() && version >= slot.applied) slot.onError?.(error);
    }
  }));
}
