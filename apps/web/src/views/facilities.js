import { state } from "../store.js";
import { ICONS, emptyState, formatDate, html, pill } from "../ui.js";

const HAZARDS = [
  ["machinery", "Machinery / moving parts"],
  ["hazardousChemicals", "Hazardous chemicals"],
  ["forklifts", "Forklifts / powered trucks"],
  ["lockoutTagout", "Lockout / Tagout"],
  ["ppe", "PPE required"],
  ["respiratoryHazards", "Respiratory hazards"],
  ["hearingNoise", "High noise"],
  ["hazardousWaste", "Hazardous waste"],
  ["oilFuelStorage", "Oil / fuel storage"]
];

export function facilitiesView() {
  return `
    <div class="page-head">
      <div>
        <h1>Facilities</h1>
        <p class="page-sub">Each facility's country, region, industry, and hazard profile determine which rules pack and obligations apply. Rules pack selection happens on the backend.</p>
      </div>
    </div>

    <div class="grid-2">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Registered facilities</h2>
            <p class="hint">${state.facilities.length} facility${state.facilities.length === 1 ? "" : "ies"} in ${html(state.organization?.name || "your organization")}</p>
          </div>
        </div>
        <div class="card-body tight">
          ${state.facilities.length ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Facility</th><th>Jurisdiction</th><th>Rules pack</th><th>Employees</th><th>Created</th></tr></thead>
                <tbody>
                  ${state.facilities.map((facility) => `
                    <tr data-action="select-facility" data-facility-id="${html(facility.id)}" data-row-link>
                      <td>
                        <div class="cell-strong">${html(facility.name)} ${facility.id === state.selectedFacilityId ? pill("active", { text: "Active" }) : ""}</div>
                        <div class="cell-sub">${html(facility.facilityType.replaceAll("_", " "))}</div>
                      </td>
                      <td class="cell-nowrap">${html(facility.country)} · ${html(facility.stateProvince)}<div class="cell-sub">${html(facility.jurisdictionCode || "")}</div></td>
                      <td>${facility.selectedRulesPackId ? `<span class="pill pill-brand plain">${html(facility.selectedRulesPackId)}</span>` : `<span class="muted small">pending analysis</span>`}</td>
                      <td class="mono">${facility.employeeCount ?? "—"}</td>
                      <td class="cell-nowrap muted">${formatDate(facility.createdAt)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          ` : emptyState({
            icon: "facility",
            title: "No facilities yet",
            copy: "Create a facility to select its jurisdiction-specific rules pack and start collecting evidence."
          })}
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h2>New facility</h2>
            <p class="hint">Country and region select the rules pack; the hazard profile filters which obligations apply.</p>
          </div>
        </div>
        <div class="card-body">
          <form id="facility-form" class="form-grid cols-2" data-form="create-facility">
            <label class="field form-span">
              <span class="field-label">Facility name</span>
              <input name="name" placeholder="e.g. Cleveland Metal Components Plant" required />
            </label>
            <label class="field">
              <span class="field-label">Country</span>
              <select name="country" required>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="MX">Mexico</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">State / province</span>
              <input name="stateProvince" placeholder="e.g. Ohio" required />
            </label>
            <label class="field">
              <span class="field-label">Region code</span>
              <input name="region" placeholder="e.g. OH, ON, NL" required />
              <span class="field-hint">Short code used in the jurisdiction identifier.</span>
            </label>
            <label class="field">
              <span class="field-label">Jurisdiction code <span class="muted">(optional)</span></span>
              <input name="jurisdictionCode" placeholder="Defaults to COUNTRY-REGION" />
            </label>
            <label class="field">
              <span class="field-label">Industry</span>
              <input name="industry" value="industrial_manufacturing" required />
            </label>
            <label class="field">
              <span class="field-label">Facility type</span>
              <input name="facilityType" value="metal_fabrication" required />
            </label>
            <label class="field">
              <span class="field-label">Employee count</span>
              <input name="employeeCount" type="number" value="75" min="0" />
            </label>
            <div class="field form-span">
              <span class="field-label">Hazard profile</span>
              <div class="check-grid">
                ${HAZARDS.map(([name, text]) => `<label class="check-item"><input type="checkbox" name="${name}" /> ${text}</label>`).join("")}
              </div>
              <span class="field-hint">Emergency action plan and fire extinguisher obligations are included for all facilities by default.</span>
            </div>
            <div class="form-footer form-span">
              <button type="submit" class="btn btn-primary">${ICONS.plus} Create facility</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  `;
}
