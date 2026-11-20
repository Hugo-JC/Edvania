import test from "node:test";
import assert from "node:assert/strict";
import {roleCan} from "./policy.ts";
test("employee can read and execute sales but cannot manage finance",()=>{assert.equal(roleCan("employee","read"),true);assert.equal(roleCan("employee","commercial_write"),true);assert.equal(roleCan("employee","cash_manage"),false);assert.equal(roleCan("employee","finance_write"),false);});
test("manager and admin can manage catalog and cash",()=>{assert.equal(roleCan("manager","catalog_write"),true);assert.equal(roleCan("manager","cash_manage"),true);assert.equal(roleCan("admin","finance_write"),true);assert.equal(roleCan("owner","cash_manage"),true);});
