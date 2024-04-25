import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../database/models/user.model';
import { LoginUserDto } from './dto';
import { comparePassword } from 'src/helpers/utils/utils';

@Injectable()
export class AuthService {
  private readonly maxLoginAttempts = 3;
  private readonly loginBlock = 10 * 60 * 1000;

  constructor(
    private readonly usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async signup(userData) {
    try {
      return await this.usersService.createUser(userData);
    } catch (error) {
      return error.message;
    }
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<UserDocument | string> {
    try {
      const user = await this.usersService.findOne({ email }); 
      if (user) {
        return user;
      } else {
        return 'User not found'; 
      }
    } catch (error) {
      return error.message;
    }
  }
  

  async login(userData: LoginUserDto, user: UserDocument) {
    try {
      console.log("loginAttempts:", user.loginAttempts);
      console.log("maxLoginAttempts:", this.maxLoginAttempts);
      console.log("lockUntil:", user.lockUntil);
      console.log("Current time:", Date.now());

        if (!user) {
            throw new NotFoundException("User not found");
        }

        if (!user.loginAttempts) {
            user.loginAttempts = 0;
        }

        if (user.loginAttempts >= this.maxLoginAttempts && user.lockUntil > Date.now()) {
            const timeUntilUnlock = new Date(user.lockUntil);
            return {
                message: `Account locked. Please try again after ${timeUntilUnlock}`,
                error: "Unauthorized",
                statusCode: 401
            };
        }

        const matched = await comparePassword(userData.password, user.password);
        if (matched) {
            user.loginAttempts = 0;
            user.lockUntil = undefined;

            await user.save();

            const { email } = userData;
            const payload = { email, user_id: user._id };
            return {
                access_token: this.jwtService.sign(payload),
            };
        } else {
            user.loginAttempts ++;

            await user.save();
            
            if (!user.lockUntil || user.lockUntil < Date.now()) {
              user.lockUntil = Date.now() + this.loginBlock;
          }          
            return {
                message: "Password incorrect",
                error: "Unauthorized",
                statusCode: 401
            };
        }
    } catch (error) {
        return {
            message: error.message,
            error: "Unauthorized",
            statusCode: 401
        };
      }

  }
}