"use client";

import { useEffect, useMemo, useState } from "react";

import { useWorkspaceMode } from "@/components/dashboard/mode-provider";
import { useDashboardSession } from "@/components/dashboard/session-provider";
import {
  StatusBadge,
  formatDateTime,
  toErrorMessage,
} from "@/components/dashboard/dashboard-utils";
import { useResource } from "@/components/dashboard/use-resource";
import {
  Button,
  Card,
  DarkCard,
  DarkField,
  Input,
  MetricCard,
  PaginationControls,
  PageState,
  Select,
  StatGrid,
  Table,
  TableRow,
} from "@/components/dashboard/ui";
import {
  createDeveloperKey,
  createWebhook,
  loadDeveloperWorkspace,
  revokeDeveloperKey,
  rotateWebhookSecret,
  sendWebhookTest,
  supportedWebhookEvents,
  updateWebhook,
  type DeliveryRecord,
  type DeveloperKeyRecord,
  type SupportedWebhookEvent,
  type WebhookRecord,
} from "@/lib/developers";

type WebhookDraft = {
  label: string;
  endpointUrl: string;
  eventTypes: SupportedWebhookEvent[];
  retryPolicy: WebhookRecord["retryPolicy"];
  status: WebhookRecord["status"];
};

function createDefaultWebhookEvents(): SupportedWebhookEvent[] {
  return [...supportedWebhookEvents] as SupportedWebhookEvent[];
}

function createWebhookDraft(webhook: WebhookRecord): WebhookDraft {
  return {
    label: webhook.label,
    endpointUrl: webhook.endpointUrl,
    eventTypes: webhook.eventTypes,
    retryPolicy: webhook.retryPolicy,
    status: webhook.status,
  };
}

function EventSelector({
  selected,
  disabled = false,
  surface = "light",
  onToggle,
}: {
  selected: readonly SupportedWebhookEvent[];
  disabled?: boolean;
  surface?: "light" | "dark";
  onToggle: (eventType: SupportedWebhookEvent) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {supportedWebhookEvents.map((eventType) => {
        const isChecked = selected.includes(eventType);

        return (
          <label
            key={eventType}
            className={
              surface === "dark"
                ? "flex items-center gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-medium tracking-[-0.02em] text-white"
                : "flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-medium tracking-[-0.02em] text-[color:var(--ink)]"
            }
          >
            <input
              type="checkbox"
              checked={isChecked}
              disabled={disabled}
              onChange={() => onToggle(eventType)}
              className={
                surface === "dark"
                  ? "h-4 w-4 rounded border-white/16 bg-transparent text-[#d9f6bc] focus:ring-[#d9f6bc]"
                  : "h-4 w-4 rounded border-[color:var(--line)] text-[#0c4a27] focus:ring-[#0c4a27]"
              }
            />
            <span>{eventType}</span>
          </label>
        );
      })}
    </div>
  );
}

function toggleEventType(
  current: readonly SupportedWebhookEvent[],
  eventType: SupportedWebhookEvent
) {
  return current.includes(eventType)
    ? current.filter((value) => value !== eventType)
    : [...current, eventType];
}

export default function DevelopersPage() {
  const { token, user } = useDashboardSession();
  const { mode } = useWorkspaceMode();
  const [keyPage, setKeyPage] = useState(1);
  const [webhookPage, setWebhookPage] = useState(1);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [editingWebhook, setEditingWebhook] = useState<WebhookDraft | null>(null);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newWebhook, setNewWebhook] = useState<{
    label: string;
    endpointUrl: string;
    eventTypes: SupportedWebhookEvent[];
    retryPolicy: WebhookRecord["retryPolicy"];
  }>({
    label: "",
    endpointUrl: "",
    eventTypes: createDefaultWebhookEvents(),
    retryPolicy: "exponential",
  });
  const [testEventType, setTestEventType] =
    useState<SupportedWebhookEvent>("charge.settled");
  const keyPageSize = 12;
  const webhookPageSize = 12;
  const deliveryPageSize = 12;

  const { data, isLoading, error, reload } = useResource(
    async ({ token, merchantId }) =>
      loadDeveloperWorkspace({
        token,
        merchantId,
        environment: mode,
        keyPage,
        keyLimit: keyPageSize,
        webhookPage,
        webhookLimit: webhookPageSize,
        deliveryPage,
        deliveryLimit: deliveryPageSize,
        webhookId: selectedWebhookId,
      }),
    [deliveryPage, keyPage, mode, selectedWebhookId, webhookPage]
  );

  const keys = data?.keys ?? [];
  const webhooks = data?.webhooks ?? [];
  const deliveries = data?.deliveries ?? [];
  const keysPagination = data?.keysPagination ?? {
    page: keyPage,
    limit: keyPageSize,
    total: keys.length,
    totalPages: 1,
  };
  const webhooksPagination = data?.webhooksPagination ?? {
    page: webhookPage,
    limit: webhookPageSize,
    total: webhooks.length,
    totalPages: 1,
  };
  const deliveriesPagination = data?.deliveriesPagination ?? {
    page: deliveryPage,
    limit: deliveryPageSize,
    total: deliveries.length,
    totalPages: 1,
  };
  const selectedWebhook =
    webhooks.find((webhook) => webhook.id === selectedWebhookId) ?? null;
  const selectedWebhookDeliveries = deliveries;

  useEffect(() => {
    if (webhooks.length === 0) {
      setSelectedWebhookId(null);
      return;
    }

    if (!selectedWebhookId || !webhooks.some((webhook) => webhook.id === selectedWebhookId)) {
      setSelectedWebhookId(webhooks[0].id);
    }
  }, [selectedWebhookId, webhooks]);

  useEffect(() => {
    setEditingWebhook(selectedWebhook ? createWebhookDraft(selectedWebhook) : null);
  }, [selectedWebhook]);

  useEffect(() => {
    if (!message && !errorMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 3600);

    return () => window.clearTimeout(timeout);
  }, [errorMessage, message]);

  useEffect(() => {
    setKeyPage(1);
    setWebhookPage(1);
    setDeliveryPage(1);
  }, [mode]);

  useEffect(() => {
    setDeliveryPage(1);
  }, [selectedWebhookId]);

  const metrics = useMemo(
    () => ({
      keys: keysPagination.total,
      activeKeys: keys.filter((key) => key.status === "active").length,
      webhooks: webhooksPagination.total,
      activeWebhooks: webhooks.filter((webhook) => webhook.status === "active").length,
      deliveries: deliveriesPagination.total,
      failedDeliveries: deliveries.filter((delivery) => delivery.status === "failed").length,
    }),
    [deliveries, deliveriesPagination.total, keys, keysPagination.total, webhooks, webhooksPagination.total]
  );

  async function runAction(key: string, runner: () => Promise<void>) {
    setIsBusy(key);
    setMessage(null);
    setErrorMessage(null);

    try {
      await runner();
      await reload();
    } catch (actionError) {
      setErrorMessage(toErrorMessage(actionError));
    } finally {
      setIsBusy(null);
    }
  }

  async function handleCreateKey() {
    if (!token || !user?.merchantId || !newKeyLabel.trim()) {
      return;
    }

    await runAction("create-key", async () => {
      const result = await createDeveloperKey({
        token,
        merchantId: user.merchantId,
        label: newKeyLabel.trim(),
        environment: mode,
      });
      setKeyPage(1);
      setNewKeyLabel("");
      setMessage(`Server key created: ${result.token}`);
    });
  }

  async function handleRevokeKey(key: DeveloperKeyRecord) {
    if (!token) {
      return;
    }

    await runAction(`revoke-key:${key.id}`, async () => {
      await revokeDeveloperKey({
        token,
        merchantId: key.merchantId,
        developerKeyId: key.id,
      });
      setMessage("Server key revoked.");
    });
  }

  async function handleCreateWebhook() {
    if (
      !token ||
      !user?.merchantId ||
      !newWebhook.label.trim() ||
      !newWebhook.endpointUrl.trim() ||
      newWebhook.eventTypes.length === 0
    ) {
      return;
    }

    await runAction("create-webhook", async () => {
      const result = await createWebhook({
        token,
        merchantId: user.merchantId,
        environment: mode,
        label: newWebhook.label.trim(),
        endpointUrl: newWebhook.endpointUrl.trim(),
        eventTypes: newWebhook.eventTypes,
        retryPolicy: newWebhook.retryPolicy,
      });

      setWebhookPage(1);
      setDeliveryPage(1);
      setNewWebhook({
        label: "",
        endpointUrl: "",
        eventTypes: createDefaultWebhookEvents(),
        retryPolicy: "exponential",
      });
      setSelectedWebhookId(result.webhook.id);
      setMessage(`Webhook created. Secret: ${result.secret}`);
    });
  }

  async function handleSaveWebhook() {
    if (!token || !selectedWebhook || !editingWebhook) {
      return;
    }

    await runAction(`save-webhook:${selectedWebhook.id}`, async () => {
      await updateWebhook({
        token,
        merchantId: selectedWebhook.merchantId,
        environment: mode,
        webhookId: selectedWebhook.id,
        payload: {
          label: editingWebhook.label.trim(),
          endpointUrl: editingWebhook.endpointUrl.trim(),
          eventTypes: editingWebhook.eventTypes,
          retryPolicy: editingWebhook.retryPolicy,
          status: editingWebhook.status,
        },
      });
      setMessage("Webhook updated.");
    });
  }

  async function handleRotateSecret() {
    if (!token || !selectedWebhook) {
      return;
    }

    await runAction(`rotate-secret:${selectedWebhook.id}`, async () => {
      const result = await rotateWebhookSecret({
        token,
        merchantId: selectedWebhook.merchantId,
        environment: mode,
        webhookId: selectedWebhook.id,
      });
      setMessage(`Secret rotated: ${result.secret}`);
    });
  }

  async function handleSendTest() {
    if (!token || !selectedWebhook) {
      return;
    }

    await runAction(`send-test:${selectedWebhook.id}`, async () => {
      const delivery = await sendWebhookTest({
        token,
        merchantId: selectedWebhook.merchantId,
        environment: mode,
        webhookId: selectedWebhook.id,
        eventType: testEventType,
      });

      setMessage(
        delivery.status === "delivered"
          ? "Test delivery completed."
          : "Test delivery queued."
      );
    });
  }

  if (isLoading && !data) {
    return (
      <PageState
        title="Loading developer tools"
        message="Fetching server keys, webhook endpoints, and delivery history."
      />
    );
  }

  if (error || !data) {
    return (
      <PageState
        title="Developer tools unavailable"
        message={error ?? "Unable to load developer resources."}
        tone="danger"
        action={
          <button
            className="text-sm font-semibold"
            onClick={() => void reload()}
          >
            Retry
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard label="Server keys" value={String(metrics.keys)} note={`${metrics.activeKeys} active on page`} tone="brand" />
        <MetricCard label="Webhooks" value={String(metrics.webhooks)} note={`${metrics.activeWebhooks} active on page`} />
        <MetricCard label="Deliveries" value={String(metrics.deliveries)} note={selectedWebhook ? "For selected webhook" : "Current environment"} />
        <MetricCard label="Failed" value={String(metrics.failedDeliveries)} note="Visible page" />
      </StatGrid>

      {message ? (
        <div className="rounded-2xl border border-[#d6ebc7] bg-[#f4fbef] px-4 py-3 text-sm font-medium text-[#0c4a27]">
          {message}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-[#e4c4be] bg-[#fff7f6] px-4 py-3 text-sm font-medium text-[#922f25]">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <Card title="Server keys" description="Backend credentials for the selected environment.">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                placeholder="Server key label"
                value={newKeyLabel}
                onChange={(event) => setNewKeyLabel(event.target.value)}
              />
              <Button
                tone="brand"
                disabled={isBusy === "create-key" || !newKeyLabel.trim()}
                onClick={() => void handleCreateKey()}
              >
                {isBusy === "create-key" ? "Creating..." : "Create server key"}
              </Button>
            </div>

            <Table columns={["Label", "Last used", "Status"]}>
              {keys.map((key) => (
                <TableRow key={key.id} columns={3}>
                  <div>
                    <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                      {key.label}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      {key.maskedToken}
                    </p>
                  </div>
                  <p className="text-sm text-[color:var(--muted)]">
                    {formatDateTime(key.lastUsedAt)}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge value={key.status} />
                    {key.status === "active" ? (
                      <Button
                        disabled={isBusy === `revoke-key:${key.id}`}
                        onClick={() => void handleRevokeKey(key)}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </TableRow>
              ))}
            </Table>

            <PaginationControls
              page={keysPagination.page}
              total={keysPagination.total}
              totalPages={keysPagination.totalPages}
              onPrevious={() => setKeyPage((current) => Math.max(1, current - 1))}
              onNext={() =>
                setKeyPage((current) => Math.min(keysPagination.totalPages, current + 1))
              }
            />
          </div>
        </Card>

        <Card title="Webhook endpoints" description="Endpoints registered for the selected environment.">
          <div className="space-y-4">
            {webhooks.length === 0 ? (
              <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-10 text-center text-sm text-[color:var(--muted)]">
                No webhook endpoints yet for this environment.
              </div>
            ) : (
              <Table columns={["Label", "Events", "Status", "Manage"]}>
                {webhooks.map((webhook) => (
                  <TableRow key={webhook.id} columns={4}>
                    <div>
                      <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                        {webhook.label}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">
                        {webhook.endpointUrl}
                      </p>
                    </div>
                    <p className="text-sm text-[color:var(--muted)]">
                      {webhook.eventTypes.join(", ")}
                    </p>
                    <div>
                      <StatusBadge value={webhook.status} />
                    </div>
                    <div className="flex justify-start md:justify-end">
                      <Button
                        tone={selectedWebhookId === webhook.id ? "brand" : "neutral"}
                        onClick={() => setSelectedWebhookId(webhook.id)}
                      >
                        {selectedWebhookId === webhook.id ? "Selected" : "Manage"}
                      </Button>
                    </div>
                  </TableRow>
                ))}
              </Table>
            )}

            <PaginationControls
              page={webhooksPagination.page}
              total={webhooksPagination.total}
              totalPages={webhooksPagination.totalPages}
              onPrevious={() => setWebhookPage((current) => Math.max(1, current - 1))}
              onNext={() =>
                setWebhookPage((current) => Math.min(webhooksPagination.totalPages, current + 1))
              }
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
        <Card title="Create webhook" description="Register a real endpoint and choose the events to deliver.">
          <div className="space-y-4">
            <Input
              placeholder="Webhook label"
              value={newWebhook.label}
              onChange={(event) =>
                setNewWebhook((current) => ({
                  ...current,
                  label: event.target.value,
                }))
              }
            />
            <Input
              placeholder="https://api.acme.example/renew/webhooks"
              value={newWebhook.endpointUrl}
              onChange={(event) =>
                setNewWebhook((current) => ({
                  ...current,
                  endpointUrl: event.target.value,
                }))
              }
            />
            <EventSelector
              selected={newWebhook.eventTypes}
              onToggle={(eventType) =>
                setNewWebhook((current) => ({
                  ...current,
                  eventTypes: toggleEventType(current.eventTypes, eventType),
                }))
              }
            />
            <Select
              value={newWebhook.retryPolicy}
              onChange={(event) =>
                setNewWebhook((current) => ({
                  ...current,
                  retryPolicy: event.target.value as WebhookRecord["retryPolicy"],
                }))
              }
            >
              <option value="none">No retries</option>
              <option value="linear">Linear retries</option>
              <option value="exponential">Exponential retries</option>
            </Select>
            <Button
              tone="brand"
              disabled={
                isBusy === "create-webhook" ||
                !newWebhook.label.trim() ||
                !newWebhook.endpointUrl.trim() ||
                newWebhook.eventTypes.length === 0
              }
              onClick={() => void handleCreateWebhook()}
            >
              {isBusy === "create-webhook" ? "Creating..." : "Create webhook"}
            </Button>
          </div>
        </Card>

        <DarkCard
          title={selectedWebhook?.label ?? "Webhook details"}
          description={
            selectedWebhook?.endpointUrl ?? "Select a webhook endpoint to edit, rotate, and test."
          }
        >
          {selectedWebhook && editingWebhook ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DarkField
                  label="Last delivery"
                  value={formatDateTime(selectedWebhook.lastDeliveryAt)}
                />
                <DarkField
                  label="Current status"
                  value={<StatusBadge value={selectedWebhook.status} />}
                />
              </div>

              <Input
                className="border-white/12 bg-white/6 text-white placeholder:text-white/40 focus:border-[#d9f6bc]"
                value={editingWebhook.label}
                onChange={(event) =>
                  setEditingWebhook((current) =>
                    current
                      ? {
                          ...current,
                          label: event.target.value,
                        }
                      : current
                  )
                }
              />
              <Input
                className="border-white/12 bg-white/6 text-white placeholder:text-white/40 focus:border-[#d9f6bc]"
                value={editingWebhook.endpointUrl}
                onChange={(event) =>
                  setEditingWebhook((current) =>
                    current
                      ? {
                          ...current,
                          endpointUrl: event.target.value,
                        }
                      : current
                  )
                }
              />
              <EventSelector
                selected={editingWebhook.eventTypes}
                surface="dark"
                onToggle={(eventType) =>
                  setEditingWebhook((current) =>
                    current
                      ? {
                          ...current,
                          eventTypes: toggleEventType(current.eventTypes, eventType),
                        }
                      : current
                  )
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  className="border-white/12 bg-white/6 text-white focus:border-[#d9f6bc]"
                  value={editingWebhook.retryPolicy}
                  onChange={(event) =>
                    setEditingWebhook((current) =>
                      current
                        ? {
                            ...current,
                            retryPolicy: event.target.value as WebhookRecord["retryPolicy"],
                          }
                        : current
                    )
                  }
                >
                  <option value="none">No retries</option>
                  <option value="linear">Linear retries</option>
                  <option value="exponential">Exponential retries</option>
                </Select>
                <Select
                  className="border-white/12 bg-white/6 text-white focus:border-[#d9f6bc]"
                  value={editingWebhook.status}
                  onChange={(event) =>
                    setEditingWebhook((current) =>
                      current
                        ? {
                            ...current,
                            status: event.target.value as WebhookRecord["status"],
                          }
                        : current
                    )
                  }
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </Select>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  tone="darkBrand"
                  disabled={
                    isBusy === `save-webhook:${selectedWebhook.id}` ||
                    !editingWebhook.label.trim() ||
                    !editingWebhook.endpointUrl.trim() ||
                    editingWebhook.eventTypes.length === 0
                  }
                  onClick={() => void handleSaveWebhook()}
                >
                  {isBusy === `save-webhook:${selectedWebhook.id}`
                    ? "Saving..."
                    : "Save changes"}
                </Button>
                <Button
                  tone="darkNeutral"
                  disabled={isBusy === `rotate-secret:${selectedWebhook.id}`}
                  onClick={() => void handleRotateSecret()}
                >
                  {isBusy === `rotate-secret:${selectedWebhook.id}`
                    ? "Rotating..."
                    : "Rotate secret"}
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <Select
                  className="border-white/12 bg-white/6 text-white focus:border-[#d9f6bc]"
                  value={testEventType}
                  onChange={(event) =>
                    setTestEventType(event.target.value as SupportedWebhookEvent)
                  }
                >
                  {supportedWebhookEvents.map((eventType) => (
                    <option key={eventType} value={eventType}>
                      {eventType}
                    </option>
                  ))}
                </Select>
                <Button
                  tone="darkBrand"
                  disabled={isBusy === `send-test:${selectedWebhook.id}`}
                  onClick={() => void handleSendTest()}
                >
                  {isBusy === `send-test:${selectedWebhook.id}`
                    ? "Sending..."
                    : "Send real test"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-10 text-center text-sm text-white/66">
              Select a webhook endpoint to manage it.
            </div>
          )}
        </DarkCard>
      </div>

      <Card
        title="Webhook deliveries"
        description={
          selectedWebhook
            ? `Recent delivery attempts for ${selectedWebhook.label}.`
            : "Recent delivery attempts for the selected environment."
        }
      >
        {selectedWebhookDeliveries.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-10 text-center text-sm text-[color:var(--muted)]">
            No deliveries recorded yet.
          </div>
        ) : (
          <Table columns={["Event", "Attempts", "HTTP", "Delivered", "Status"]}>
            {selectedWebhookDeliveries.map((delivery: DeliveryRecord) => (
              <div key={delivery.id} className="space-y-2">
                <TableRow columns={5}>
                  <div>
                    <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                      {delivery.eventType}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      {delivery.eventId}
                    </p>
                  </div>
                  <p className="text-sm text-[color:var(--muted)]">{delivery.attempts}</p>
                  <p className="text-sm text-[color:var(--muted)]">
                    {delivery.httpStatus ?? "--"}
                  </p>
                  <p className="text-sm text-[color:var(--muted)]">
                    {formatDateTime(delivery.deliveredAt)}
                  </p>
                  <div>
                    <StatusBadge value={delivery.status} />
                  </div>
                </TableRow>
                {delivery.errorMessage ? (
                  <div className="rounded-2xl border border-[#efe2df] bg-[#fff7f6] px-4 py-3 text-sm text-[#922f25]">
                    {delivery.errorMessage}
                  </div>
                ) : null}
              </div>
            ))}
          </Table>
        )}

        <PaginationControls
          page={deliveriesPagination.page}
          total={deliveriesPagination.total}
          totalPages={deliveriesPagination.totalPages}
          onPrevious={() => setDeliveryPage((current) => Math.max(1, current - 1))}
          onNext={() =>
            setDeliveryPage((current) => Math.min(deliveriesPagination.totalPages, current + 1))
          }
        />
      </Card>
    </div>
  );
}
