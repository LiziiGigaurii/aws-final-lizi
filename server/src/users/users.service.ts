import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async findByUsername(username: string) {
    const user = await this.userModel.findOne({ username: username });
    return user;
  }

  async findByEmail(email: string) {
    const user = await this.userModel.findOne({ email: email });
    return user;
  }

  async create(username: string, email: string, hashedPassword: string) {
    const newUser = new this.userModel({
      username: username,
      email: email,
      password: hashedPassword,
    });

    const savedUser = await newUser.save();
    return savedUser;
  }
}