"use client";

import { AddDivisionSection } from "~~/app/voting/admin/_components/AddDivisionSection";
import { GNManagementSection } from "~~/app/voting/admin/_components/GNManagementSection";
import { GroupHeading } from "~~/app/voting/admin/_components/Section";

/**
 * Admin › Divisions.
 *
 * Provisioning, not operations: which divisions exist and who staffs them.
 * These panels have no phase gate and are used once when an election is set up,
 * so they no longer sit between the controls an operator needs on the day.
 */
const AdminDivisionsPage = () => (
  <>
    <GroupHeading
      title="Registry administration"
      subtitle="Divisions and the officers who staff them. Changes here affect the whole election, not one ballot."
    />

    <GNManagementSection />

    <AddDivisionSection />
  </>
);

export default AdminDivisionsPage;
