import { RolesRepository } from './roles.repository';

export class RolesService {
	constructor(private readonly rolesRepository = new RolesRepository()) {}

	getAllRoles() {
		return this.rolesRepository.getAllRoles();
	}
}
