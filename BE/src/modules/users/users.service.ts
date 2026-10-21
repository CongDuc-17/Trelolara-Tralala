import { Prisma, users } from '@prisma/client';
import { Exception } from '@/common/exceptions/app-error';
import { genSalt, hash } from 'bcrypt';
import { StatusCodes } from 'http-status-codes';

import { AuthRepository } from '../auth/auth.repository';

import {
	GetUserByUserIdRequestDto,
	GetUserResponseDto,
	GetUsersRequestDto,
	GetUsersResponseDto,
	UpdateMyInformationRequestDto,
	UpdateMyPasswordRequestDto,
	UserInformationDto,
} from './dtos';
import { UsersRepository } from './users.repository';

import {
	HttpResponseBodySuccessDto,
	NotFoundException,
	ObjectComparerDto,
	OptionalException,
	PaginationDto,
	PaginationUtils,
} from '@/common';
import {
	deleteImageFromCloudinary,
	extractPublicIdFromUrl,
	uploadImageFromBuffer,
} from '@/common/utils/cloudinary.utils';

export class UsersService {
	constructor(
		private readonly authRepository: AuthRepository = new AuthRepository(),
		private readonly usersRepository: UsersRepository = new UsersRepository(),
	) {}

	async getUsers(
		getUsersRequest: GetUsersRequestDto,
		pagination: PaginationDto,
	): Promise<HttpResponseBodySuccessDto<GetUsersResponseDto[]>> {
		const { name, status } = getUsersRequest;
		const paginationUtils = new PaginationUtils().extractSkipTakeFromPagination(
			pagination,
		);
		const [users, totalUsers] = await this.usersRepository.findUsers({
			name: name,
			status: status,
			skip: paginationUtils.skip,
			take: paginationUtils.take,
		});

		const userResponse = users.map((user) => new GetUsersResponseDto(user));
		return {
			success: true,
			data: userResponse,
			pagination:
				paginationUtils.convertPaginationResponseDtoFromTotalRecords(totalUsers),
		};
	}

	async getUserByUserId(
		getUserByUserIdRequestDto: GetUserByUserIdRequestDto,
	): Promise<HttpResponseBodySuccessDto<GetUserResponseDto>> {
		const { userId, status } = getUserByUserIdRequestDto;
		const user = await this.usersRepository.findUser({
			userId: userId,
			userStatus: status,
		});

		if (!user) {
			throw new NotFoundException('userId');
		}

		return {
			success: true,
			data: new GetUserResponseDto(user),
		};
	}

	async getMyInformation(
		myInformationDto: UserInformationDto,
	): Promise<HttpResponseBodySuccessDto<GetUserResponseDto>> {
		return {
			success: true,
			data: new GetUserResponseDto(myInformationDto),
		};
	}

	async updateMyInformation(
		updateMyInformationRequestDto: UpdateMyInformationRequestDto,
		myInformationDto: UserInformationDto,
		file?: Express.Multer.File,
	): Promise<HttpResponseBodySuccessDto<GetUserResponseDto> | Exception> {
		let uploadedImage: any = null;

		try {
			if (file) {
				uploadedImage = await uploadImageFromBuffer(
					file.buffer,
					file.mimetype,
					'TrelloLike_Avatars',
				);

				updateMyInformationRequestDto.avatar = uploadedImage.secure_url;
				console.log('Ảnh đã được upload lên Cloudinary:', uploadedImage);
			}

			const updateUserData = new ObjectComparerDto<users>(
				myInformationDto,
			).getUpdatedFields<Prisma.usersUpdateManyMutationInput>(
				updateMyInformationRequestDto,
			);
			if (Object.keys(updateUserData).length === 0) {
				if (uploadedImage && uploadedImage.public_id) {
					const check = await deleteImageFromCloudinary(
						uploadedImage.public_id,
					);
					console.log(
						'Đã xóa ảnh đã upload do không có trường nào được cập nhật:',
						check,
					);
				}
				console.log('Không có trường nào được cập nhật');
				return new OptionalException(
					StatusCodes.UNPROCESSABLE_ENTITY,
					'No fields to update',
				);
			}

			const updatedUser = await this.usersRepository.updateUser({
				userId: myInformationDto.id,
				user: updateUserData,
			});
			if (file && myInformationDto.avatar) {
				const oldPublicId = extractPublicIdFromUrl(myInformationDto.avatar);
				if (oldPublicId) {
					await deleteImageFromCloudinary(oldPublicId);
					console.log(`Đã xóa thành công ảnh cũ có public_id: ${oldPublicId}`);
				}
			}
			return {
				success: true,
				data: new GetUserResponseDto(updatedUser),
			};
		} catch (error) {
			if (uploadedImage && uploadedImage.public_id) {
				await deleteImageFromCloudinary(uploadedImage.public_id);
			}
			throw new OptionalException(
				StatusCodes.INTERNAL_SERVER_ERROR,
				'Lỗi khi cập nhật thông tin người dùng',
			);
		}
	}

	async updateMyPassword(
		updateMyPasswordRequestDto: UpdateMyPasswordRequestDto,
		myInformationDto: UserInformationDto,
	): Promise<HttpResponseBodySuccessDto<GetUserResponseDto> | Exception> {
		const { newPassword } = updateMyPasswordRequestDto;
		const account = await this.authRepository.findAccount({
			userId: myInformationDto.id,
			email: myInformationDto.email,
		});

		const salt = await genSalt(10);
		const hashedPassword = await hash(newPassword, salt);

		if (!account) {
			const account: Prisma.accountsCreateInput = {
				salt: salt,
				password: hashedPassword,
				user: {
					connect: {
						id: myInformationDto.id,
					},
				},
			};

			await this.authRepository.createAccount({
				accounts: account,
			});
		}

		await this.authRepository.updatePassword({
			userId: myInformationDto.id,
			salt: salt,
			password: hashedPassword,
		});

		return {
			success: true,
			data: new GetUserResponseDto(myInformationDto),
		};
	}
}
