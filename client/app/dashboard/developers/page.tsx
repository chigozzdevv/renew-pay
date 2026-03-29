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
  Field,
  Input,
  MetricCard,
  Modal,
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

type SecretReveal = {
  title: string;
  value: string;
  note: string;
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

function createNewWebhookDraft(): WebhookDraft {
  return {
    label: "",
    endpointUrl: "",
    eventTypes: createDefaultWebhookEvents(),
    retryPolicy: "exponential",
    status: "active",
  };
}

function EventSelector({
  selected,
  disabled = false,
  onToggle,
}: {
  selected: readonly SupportedWebhookEvent[];
  disabled?: boolean;
  onToggle: (eventType: SupportedWebhookEvent) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {supportedWebhookEvents.map((eventType) => {
        const isChecked = selected.includes(eventType);

        return (
          <label
            key={eventType}
            className="flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-[#faf9f5] px-4 py-3 text-sm font-medium tracking-[-0.02em] text-[color:var(--ink)]"
          >
            <input
              type="checkbox"
              checked={isChecked}
              disabled={disabled}
              onChange={() => onToggle(eventType)}
              className="h-4 w-4 rounded border-[color:var(--line)] text-[#111111] focus:ring-[#111111]"
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
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showCreateKey, setShowCreateKey] = useState(false);
  const [showCreateWebhook, setShowCreateWebhook] = useState(false);
  const [manageWebhook, setManageWebhook] = useState<WebhookRecord | null>(null);
  const [editingWebhook, setEditingWebhook] = useState<WebhookDraft | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newWebhook, setNewWebhook] = useState<WebhookDraft>(createNewWebhookDraft());
  const [testEventType, setTestEventType] =
    useState<SupportedWebhookEvent>("charge.settled");
  const [secretReveal, setSecretReveal] = useState<SecretReveal | null>(null);

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
    webhooks.find((webhook) => webhook.id === selectedWebhookId) ?? manageWebhook ?? null;

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

  useEffect(() => {
    if (!manageWebhook) {
      return;
    }

    const refreshedWebhook = webhooks.find((entry) => entry.id === manageWebhook.id) ?? manageWebhook;
    setManageWebhook(refreshedWebhook);
    setEditingWebhook(createWebhookDraft(refreshedWebhook));
  }, [manageWebhook?.id, webhooks]);

  const metrics = useMemo(
    () => ({
      keys: keysPagination.total,
      activeKeys: keys.filter((key) => key.status === "active").length,
      webhooks: webhooksPagination.total,
      activeWebhooks: webhooks.filter((webhook) => webhook.status === "active").length,
      deliveries: deliveriesPagination.total,
      failedDeliveries: deliveries.filter((delivery) => delivery.status === "failed").length,
    }),
    [
      deliveries,
      deliveriesPagination.total,
      keys,
      keysPagination.total,
      webhooks,
      webhooksPagination.total,
    ]
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

  function openManageWebhook(webhook: WebhookRecord) {
    setSelectedWebhookId(webhook.id);
    setManageWebhook(webhook);
    setEditingWebhook(createWebhookDraft(webhook));
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
      setShowCreateKey(false);
      setNewKeyLabel("");
      setSecretReveal({
        title: "Server key created",
        value: result.token,
        note: "Copy this token now. It will not be shown in full again.",
      });
      setMessage("Server key created.");
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
      setShowCreateWebhook(false);
      setNewWebhook(createNewWebhookDraft());
      setSelectedWebhookId(result.webhook.id);
      setSecretReveal({
        title: "Webhook secret created",
        value: result.secret,
        note: "Copy this secret now. It will not be shown in full again.",
      });
      setMessage("Webhook created.");
    });
  }

  async function handleSaveWebhook() {
    if (!token || !manageWebhook || !editingWebhook) {
      return;
    }

    await runAction(`save-webhook:${manageWebhook.id}`, async () => {
      await updateWebhook({
        token,
        merchantId: manageWebhook.merchantId,
        environment: mode,
        webhookId: manageWebhook.id,
        payload: {
          label: editingWebhook.label.trim(),
          endpointUrl: editingWebhook.endpointUrl.trim(),
          eventTypes: editingWebhook.eventTypes,
          retryPolicy: editingWebhook.retryPolicy,
          status: editingWebhook.status,
        },
      });
      setManageWebhook(null);
      setEditingWebhook(null);
      setMessage("Webhook updated.");
    });
  }

  async function handleRotateSecret(webhook: WebhookRecord) {
    if (!token) {
      return;
    }

    await runAction(`rotate-secret:${webhook.id}`, async () => {
      const result = await rotateWebhookSecret({
        token,
        merchantId: webhook.merchantId,
        environment: mode,
        webhookId: webhook.id,
      });
      setSecretReveal({
        title: "Webhook secret rotated",
        value: result.secret,
        note: "Use this new secret in your receiving service.",
      });
      setMessage("Webhook secret rotated.");
    });
  }

  async function handleSendTest(webhook: WebhookRecord) {
    if (!token) {
      return;
    }

    await runAction(`send-test:${webhook.id}`, async () => {
      const delivery = await sendWebhookTest({
        token,
        merchantId: webhook.merchantId,
        environment: mode,
        webhookId: webhook.id,
        eventType: testEventType,
      });

      setMessage(
        delivery.status === "delivered"
          ? "Test delivery completed."
          : "Test delivery queued."
      );
    });
  }

  async function handleCopySecret(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied.");
    } catch {
      setErrorMessage("Could not copy the value.");
    }
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
          <button className="text-sm font-semibold" onClick={() => void reload()}>
            Retry
          </button>
        }
      />
    );
  }

  const canCreateWebhook =
    newWebhook.label.trim().length > 0 &&
    newWebhook.endpointUrl.trim().length > 0 &&
    newWebhook.eventTypes.length > 0;
  const canSaveWebhook =
    !!editingWebhook &&
    editingWebhook.label.trim().length > 0 &&
    editingWebhook.endpointUrl.trim().length > 0 &&
    editingWebhook.eventTypes.length > 0;

  return (
    <div className="space-y-6">
      <StatGrid>
        <MetricCard
          label="Server keys"
          value={String(metrics.keys)}
          note={`${metrics.activeKeys} active on page`}
        />
        <MetricCard
          label="Webhooks"
          value={String(metrics.webhooks)}
          note={`${metrics.activeWebhooks} active on page`}
        />
        <MetricCard
          label="Deliveries"
          value={String(metrics.deliveries)}
          note={selectedWebhook ? "For selected webhook" : "Current environment"}
        />
        <MetricCard
          label="Failed"
          value={String(metrics.failedDeliveries)}
          note="Visible page"
        />
      </StatGrid>

      {message ? (
        <div className="rounded-2xl border border-[color:var(--line)] bg-[#f2f1eb] px-4 py-3 text-sm font-medium text-[color:var(--ink)]">
          {message}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-[#e4c4be] bg-[#fff7f6] px-4 py-3 text-sm font-medium text-[#922f25]">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title="Server keys"
          description="Backend credentials for the selected environment."
          action={<Button onClick={() => setShowCreateKey(true)}>Create key</Button>}
        >
          <div className="space-y-4">
            <Table columns={["Label", "Last used", "Status", "Actions"]}>
              {keys.map((key) => (
                <TableRow key={key.id} columns={4}>
                  <div>
                    <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                      {key.label}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">{key.maskedToken}</p>
                  </div>
                  <p className="self-center text-sm text-[color:var(--muted)]">
                    {formatDateTime(key.lastUsedAt)}
                  </p>
                  <div className="self-center">
                    <StatusBadge value={key.status} />
                  </div>
                  <div className="flex justify-start md:justify-end">
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

        <Card
          title="Webhook endpoints"
          description="Endpoints registered for the selected environment."
          action={<Button onClick={() => setShowCreateWebhook(true)}>Create webhook</Button>}
        >
          <div className="space-y-4">
            {webhooks.length === 0 ? (
              <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-10 text-center text-sm text-[color:var(--muted)]">
                No webhook endpoints yet for this environment.
              </div>
            ) : (
              <Table columns={["Label", "Events", "Status", "Actions"]}>
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
                    <p className="self-center text-sm text-[color:var(--muted)]">
                      {webhook.eventTypes.join(", ")}
                    </p>
                    <div className="self-center">
                      <StatusBadge value={webhook.status} />
                    </div>
                    <div className="flex items-center justify-start gap-2 md:justify-end">
                      <button
                        type="button"
                        onClick={() => openManageWebhook(webhook)}
                        className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--ink)] transition-colors hover:bg-[#f5f4ef]"
                      >
                        Manage
                      </button>
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

      <Card
        title="Webhook deliveries"
        description={
          selectedWebhook
            ? `Recent delivery attempts for ${selectedWebhook.label}.`
            : "Recent delivery attempts for the selected environment."
        }
        action={
          selectedWebhookId ? (
            <Button
              onClick={() => {
                setSelectedWebhookId(null);
                setDeliveryPage(1);
              }}
            >
              Clear filter
            </Button>
          ) : undefined
        }
      >
        {deliveries.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-10 text-center text-sm text-[color:var(--muted)]">
            No deliveries recorded yet.
          </div>
        ) : (
          <Table columns={["Event", "Attempts", "HTTP", "Delivered", "Status"]}>
            {deliveries.map((delivery: DeliveryRecord) => (
              <div key={delivery.id} className="space-y-2">
                <TableRow columns={5}>
                  <div>
                    <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                      {delivery.eventType}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">{delivery.eventId}</p>
                  </div>
                  <p className="self-center text-sm text-[color:var(--muted)]">
                    {delivery.attempts}
                  </p>
                  <p className="self-center text-sm text-[color:var(--muted)]">
                    {delivery.httpStatus ?? "--"}
                  </p>
                  <p className="self-center text-sm text-[color:var(--muted)]">
                    {formatDateTime(delivery.deliveredAt)}
                  </p>
                  <div className="self-center">
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

      <Modal
        open={showCreateKey}
        onClose={() => setShowCreateKey(false)}
        title="Create server key"
        description="Create a backend credential for the selected environment."
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setShowCreateKey(false)}>Cancel</Button>
            <Button
              tone="brand"
              disabled={isBusy === "create-key" || !newKeyLabel.trim()}
              onClick={() => void handleCreateKey()}
            >
              {isBusy === "create-key" ? "Creating..." : "Create key"}
            </Button>
          </div>
        }
      >
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[color:var(--muted)]">
            Key label
          </label>
          <Input
            placeholder="Production API key"
            value={newKeyLabel}
            onChange={(event) => setNewKeyLabel(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={showCreateWebhook}
        onClose={() => setShowCreateWebhook(false)}
        title="Create webhook"
        description="Register a real endpoint and choose the events to deliver."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => setShowCreateWebhook(false)}>Cancel</Button>
            <Button
              tone="brand"
              disabled={isBusy === "create-webhook" || !canCreateWebhook}
              onClick={() => void handleCreateWebhook()}
            >
              {isBusy === "create-webhook" ? "Creating..." : "Create webhook"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Webhook label
            </label>
            <Input
              placeholder="Billing events"
              value={newWebhook.label}
              onChange={(event) =>
                setNewWebhook((current) => ({
                  ...current,
                  label: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Endpoint URL
            </label>
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
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Events
            </label>
            <EventSelector
              selected={newWebhook.eventTypes}
              onToggle={(eventType) =>
                setNewWebhook((current) => ({
                  ...current,
                  eventTypes: toggleEventType(current.eventTypes, eventType),
                }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[color:var(--muted)]">
              Retry policy
            </label>
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
          </div>
        </div>
      </Modal>

      <Modal
        open={!!manageWebhook && !!editingWebhook}
        onClose={() => {
          setManageWebhook(null);
          setEditingWebhook(null);
        }}
        title={manageWebhook?.label ?? "Webhook details"}
        description={manageWebhook?.endpointUrl}
        size="lg"
        footer={
          manageWebhook ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={isBusy === `rotate-secret:${manageWebhook.id}`}
                  onClick={() => void handleRotateSecret(manageWebhook)}
                >
                  {isBusy === `rotate-secret:${manageWebhook.id}`
                    ? "Rotating..."
                    : "Rotate secret"}
                </Button>
                <div className="flex items-center gap-2">
                  <Select
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
                    tone="brand"
                    disabled={isBusy === `send-test:${manageWebhook.id}`}
                    onClick={() => void handleSendTest(manageWebhook)}
                  >
                    {isBusy === `send-test:${manageWebhook.id}` ? "Sending..." : "Send test"}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    setManageWebhook(null);
                    setEditingWebhook(null);
                  }}
                >
                  Close
                </Button>
                <Button
                  tone="brand"
                  disabled={
                    !canSaveWebhook || isBusy === `save-webhook:${manageWebhook.id}`
                  }
                  onClick={() => void handleSaveWebhook()}
                >
                  {isBusy === `save-webhook:${manageWebhook.id}` ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {manageWebhook && editingWebhook ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Last delivery" value={formatDateTime(manageWebhook.lastDeliveryAt)} />
              <Field
                label="Current status"
                value={<StatusBadge value={manageWebhook.status} />}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[color:var(--muted)]">
                Webhook label
              </label>
              <Input
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
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[color:var(--muted)]">
                Endpoint URL
              </label>
              <Input
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
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[color:var(--muted)]">
                Events
              </label>
              <EventSelector
                selected={editingWebhook.eventTypes}
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
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[color:var(--muted)]">
                  Retry policy
                </label>
                <Select
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
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[color:var(--muted)]">
                  Status
                </label>
                <Select
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
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!secretReveal}
        onClose={() => setSecretReveal(null)}
        title={secretReveal?.title ?? "Secret"}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3">
            {secretReveal ? (
              <Button onClick={() => void handleCopySecret(secretReveal.value)}>Copy</Button>
            ) : null}
            <Button tone="brand" onClick={() => setSecretReveal(null)}>
              Done
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[color:var(--muted)]">{secretReveal?.note}</p>
          <div className="rounded-2xl border border-[color:var(--line)] bg-[#faf9f5] px-4 py-3 font-mono text-sm text-[color:var(--ink)] break-all">
            {secretReveal?.value}
          </div>
        </div>
      </Modal>
    </div>
  );
}
