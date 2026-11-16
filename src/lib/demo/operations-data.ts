import { getDemoBrandPack } from "@/lib/demo/brands";
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

/**
 * The six operations tables for a brand.
 *
 * A pack's record arrays are read from `data/*.csv` (see
 * `src/lib/csv/source.ts::csvPackFor`), so this is only a projection: an add,
 * edit or delete has already landed in the file by the time it shows up here.
 * It used to merge the demo mutable bucket's additions and tombstone overrides
 * over fixtures — that second layer is gone, and with it the ordering rule the
 * merge imposed: rows come back in file order, which is fixture order with
 * app-saved rows appended.
 */
export function operationsFromPack(pack: ReturnType<typeof getDemoBrandPack>): DemoOperations {
  return {
    services: pack.services,
    serviceJobs: pack.serviceJobs,
    appointments: pack.appointments,
    tasks: pack.tasks,
    shifts: pack.shifts,
    visits: pack.visits,
  };
}

export async function loadDemoOperations(brandCode?: DemoBrandCode): Promise<DemoOperations> {
  return operationsFromPack(getDemoBrandPack(brandCode ?? "BR-1"));
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
