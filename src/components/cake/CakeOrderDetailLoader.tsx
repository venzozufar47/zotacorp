"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  getCakeOrder,
  listCakeOrderPayments,
} from "@/lib/actions/cake-orders.actions";
import { CakeOrderDetail } from "./CakeOrderDetail";
import type {
  CakeOptionsByKind,
  CakeOrder,
  CakeOrderAttachment,
  CakeOrderPayment,
} from "@/lib/cake-orders/types";

interface Props {
  orderId: string;
  optionsByKind: CakeOptionsByKind | null;
  isAdminView: boolean;
  canEdit: boolean;
  onClose: () => void;
}

/**
 * Side-panel adapter that fetches the detail data on demand. The
 * standalone /cake-orders/[id] route still works for direct landing;
 * this component is mounted by the kanban when a card is clicked, so
 * the helicopter view stays visible on the left.
 */
export function CakeOrderDetailLoader({
  orderId,
  optionsByKind,
  isAdminView,
  canEdit,
  onClose,
}: Props) {
  const [order, setOrder] = useState<CakeOrder | null>(null);
  const [attachments, setAttachments] = useState<CakeOrderAttachment[]>([]);
  const [payments, setPayments] = useState<CakeOrderPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const [orderRes, paymentsRes] = await Promise.all([
        getCakeOrder(orderId),
        listCakeOrderPayments(orderId),
      ]);
      if (cancelled) return;
      if (!orderRes.ok) {
        setError(orderRes.error);
        setLoading(false);
        return;
      }
      setOrder(orderRes.data!.order);
      setAttachments(orderRes.data!.attachments);
      setPayments(paymentsRes.ok ? paymentsRes.data ?? [] : []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Memuat detail…</span>
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="py-12 text-center text-sm text-destructive">
        {error ?? "Order tidak ditemukan"}
      </div>
    );
  }
  return (
    <CakeOrderDetail
      order={order}
      attachments={attachments}
      payments={payments}
      optionsByKind={optionsByKind}
      isAdminView={isAdminView}
      canEdit={canEdit}
      onClose={onClose}
    />
  );
}
