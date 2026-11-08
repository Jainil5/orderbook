import { getDemoBrandPack } from "@/lib/demo/brands";
import { readDemoMutableBucket, type DemoMutableBucket } from "@/lib/demo/mutable-store";
import { mergeOpsEntities } from "@/lib/manager/ops-shared";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { Appointment, FieldVisit, Service, ServiceJob, Shift, Task } from "@/types/operations";

export type DemoOperations = {
  services: Service[];
  serviceJobs: ServiceJob[];
  appointments: Appointment[];
  tasks: Task[];
  shifts: Shift[];
  visits: FieldVisit[];
};

export function mergeOperations(pack: ReturnType<typeof getDemoBrandPack>, bucket: DemoMutableBucket): DemoOperations {
  return {
    services: mergeOpsEntities(pack.services, bucket.services ?? [], bucket.serviceOverrides ?? {}),
    serviceJobs: mergeOpsEntities(pack.serviceJobs, bucket.serviceJobs ?? [], bucket.serviceJobOverrides ?? {}),
    appointments: mergeOpsEntities(pack.appointments, bucket.appointments ?? [], bucket.appointmentOverrides ?? {}),
    tasks: mergeOpsEntities(pack.tasks, bucket.tasks ?? [], bucket.taskOverrides ?? {}),
    shifts: mergeOpsEntities(pack.shifts, bucket.shifts ?? [], bucket.shiftOverrides ?? {}),
    visits: mergeOpsEntities(pack.visits, bucket.visits ?? [], bucket.visitOverrides ?? {}),
  };
}

export async function loadDemoOperations(brandCode?: DemoBrandCode): Promise<DemoOperations> {
  const code = brandCode ?? "BR-1";
  return mergeOperations(getDemoBrandPack(code), await readDemoMutableBucket(code));
}

export async function listDemoServices(brandCode?: DemoBrandCode): Promise<Service[]> {
  return (await loadDemoOperations(brandCode)).services;
}
export async function listDemoServiceJobs(brandCode?: DemoBrandCode): Promise<ServiceJob[]> {
  return (await loadDemoOperations(brandCode)).serviceJobs;
}
export async function listDemoAppointments(brandCode?: DemoBrandCode): Promise<Appointment[]> {
  return (await loadDemoOperations(brandCode)).appointments;
}
export async function listDemoTasks(brandCode?: DemoBrandCode): Promise<Task[]> {
  return (await loadDemoOperations(brandCode)).tasks;
}
export async function listDemoShifts(brandCode?: DemoBrandCode): Promise<Shift[]> {
  return (await loadDemoOperations(brandCode)).shifts;
}
export async function listDemoVisits(brandCode?: DemoBrandCode): Promise<FieldVisit[]> {
  return (await loadDemoOperations(brandCode)).visits;
}